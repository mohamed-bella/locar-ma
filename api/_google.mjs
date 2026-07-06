// Google Sheets sync v2 — shared engine (OAuth + snapshot rebuild).
//
// Self-contained on purpose (like the old sheet-sync.mjs): its own crypto,
// OAuth token handling, Sheets REST, and Supabase admin client, so the Vercel
// functions that use it (google-callback, sheets-sync) stay isolated with no
// app-build coupling. No googleapis dep — plain fetch + node:crypto.
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ── the six mirrored tabs + PII-excluded column mapping (single source) ──
// row(r) reads a DB row already joined with related plate / names (see fetchRows).
export const SHEET_TABS = ['Cars', 'Reservations', 'Contracts', 'Clients', 'Payments', 'Services']

const MAP = {
  vehicles: {
    tab: 'Cars',
    header: ['id', 'plate', 'brand', 'model', 'year', 'category', 'daily_rate', 'status', 'mileage_current', 'insurance_expiry', 'vignette_expiry', 'visite_tech_expiry', 'created_at'],
    select: '*',
    row: (r) => [r.id, r.plate, r.brand, r.model, r.year, r.category, r.daily_rate, r.status, r.mileage_current, r.insurance_expiry, r.vignette_expiry, r.visite_tech_expiry, r.created_at],
  },
  reservations: {
    tab: 'Reservations',
    header: ['id', 'vehicle_plate', 'client_name', 'date_start', 'date_end', 'status', 'daily_rate_snap', 'total_amount', 'pickup_location', 'dropoff_location', 'created_at'],
    select: '*, vehicles(plate), clients(full_name)',
    row: (r) => [r.id, r.vehicles?.plate, r.clients?.full_name, r.date_start, r.date_end, r.status, r.daily_rate_snap, r.total_amount, r.pickup_location, r.dropoff_location, r.created_at],
  },
  contracts: {
    tab: 'Contracts',
    header: ['id', 'reservation_id', 'vehicle_plate', 'client_name', 'status', 'mileage_out', 'mileage_in', 'fuel_out', 'fuel_in', 'check_amount', 'check_status', 'closed_at', 'created_at'],
    select: '*, reservations(status, vehicles(plate), clients(full_name))',
    row: (r) => [r.id, r.reservation_id, r.reservations?.vehicles?.plate, r.reservations?.clients?.full_name, r.reservations?.status, r.mileage_out, r.mileage_in, r.fuel_out, r.fuel_in, r.check_amount, r.check_status, r.closed_at, r.created_at],
  },
  clients: {
    // PII excluded: no CIN/passport, email, or address.
    tab: 'Clients',
    header: ['id', 'full_name', 'phone', 'nationality', 'status', 'created_at'],
    select: 'id, full_name, phone, nationality, status, created_at, agency_id',
    row: (r) => [r.id, r.full_name, r.phone, r.nationality, r.status, r.created_at],
  },
  agency_payments: {
    tab: 'Payments',
    header: ['id', 'amount', 'period', 'method', 'notes', 'paid_at', 'created_at'],
    select: '*',
    row: (r) => [r.id, r.amount, r.period, r.method, r.notes, r.paid_at, r.created_at],
  },
  service_records: {
    tab: 'Services',
    header: ['id', 'vehicle_plate', 'type', 'performed_at', 'odometer_km', 'cost', 'garage', 'notes', 'next_due_km', 'next_due_date', 'created_at'],
    select: '*, vehicles(plate)',
    row: (r) => [r.id, r.vehicles?.plate, r.type, r.performed_at, r.odometer_km, r.cost, r.garage, r.notes, r.next_due_km, r.next_due_date, r.created_at],
  },
}
// table order → tab order in the sheet
const TABLES = ['vehicles', 'reservations', 'contracts', 'clients', 'agency_payments', 'service_records']

// ── Supabase admin (service role) ──
export function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

// ── refresh-token encryption (AES-256-GCM, key = sha256(SHEETS_TOKEN_KEY)) ──
function tokenKey() {
  const secret = process.env.SHEETS_TOKEN_KEY
  if (!secret) throw new Error('SHEETS_TOKEN_KEY not set')
  return createHash('sha256').update(secret).digest() // 32 bytes
}
export function encryptToken(plain) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`
}
export function decryptToken(blob) {
  const [ivB64, tagB64, ctB64] = String(blob).split('.')
  const d = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivB64, 'base64'))
  d.setAuthTag(Buffer.from(tagB64, 'base64'))
  return d.update(Buffer.from(ctB64, 'base64'), undefined, 'utf8') + d.final('utf8')
}

// ── OAuth state signing (binds the flow to an agency; CRON_SECRET is the key) ──
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
export function signState(agencyId) {
  const payload = b64url(JSON.stringify({ a: agencyId, t: Date.now() }))
  const sig = b64url(createHmac('sha256', process.env.CRON_SECRET || '').update(payload).digest())
  return `${payload}.${sig}`
}
export function verifyState(state) {
  const [payload, sig] = String(state).split('.')
  if (!payload || !sig) return null
  const expect = b64url(createHmac('sha256', process.env.CRON_SECRET || '').update(payload).digest())
  if (sig !== expect) return null
  try {
    const { a, t } = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    if (Date.now() - t > 10 * 60 * 1000) return null // 10 min window
    return a
  } catch {
    return null
  }
}

// ── OAuth: consent URL, code→tokens, refresh→access ──
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']

export function authUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token every time
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

export async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`oauth token ${res.status} ${await res.text()}`)
  const j = await res.json() // { access_token, refresh_token, id_token, expires_in }
  return j
}

export async function accessFromRefresh(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`oauth refresh ${res.status} ${await res.text()}`)
  const j = await res.json()
  return j.access_token
}

// email from the id_token (no extra userinfo call)
export function emailFromIdToken(idToken) {
  try {
    const payload = idToken.split('.')[1]
    const j = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    return j.email || null
  } catch {
    return null
  }
}

// ── Sheets REST ──
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
async function gfetch(token, url, init) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(`sheets ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// Create the spreadsheet (in the connected user's Drive) with the six tabs.
export async function createSpreadsheet(token, title) {
  const json = await gfetch(token, SHEETS, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: SHEET_TABS.map((t, i) => ({ properties: { title: t, index: i } })),
    }),
  })
  const tabs = {}
  for (const s of json.sheets) tabs[s.properties.title] = s.properties.sheetId
  return { spreadsheetId: json.spreadsheetId, spreadsheetUrl: json.spreadsheetUrl, tabs }
}

const cell = (v) => (v == null ? '' : v)

// Read every agency row per table, mapped to sheet values (header + rows).
async function fetchTab(supa, table, agencyId) {
  const m = MAP[table]
  const { data, error } = await supa.from(table).select(m.select).eq('agency_id', agencyId).order('created_at', { ascending: true })
  if (error) throw new Error(`db ${table}: ${error.message}`)
  const rows = (data || []).map((r) => m.row(r).map(cell))
  return { tab: m.tab, values: [m.header, ...rows] }
}

// Full snapshot rebuild: clear all six tabs, then overwrite with fresh data.
// Idempotent — the sheet always reflects the current DB state. Two Sheets calls
// total (batchClear + batchUpdate), regardless of row count.
export async function syncAgency(supa, token, spreadsheetId, agencyId) {
  const tabsData = []
  for (const table of TABLES) tabsData.push(await fetchTab(supa, table, agencyId))

  // 1. wipe every tab (range = bare title clears the whole sheet)
  await gfetch(token, `${SHEETS}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: tabsData.map((t) => t.tab) }),
  })

  // 2. write header + rows for every tab in one shot
  await gfetch(token, `${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: tabsData.map((t) => ({ range: `${t.tab}!A1`, values: t.values })),
    }),
  })

  return tabsData.reduce((n, t) => n + t.values.length - 1, 0) // total data rows written
}
