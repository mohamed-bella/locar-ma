// Google Sheets sync v2 — shared engine (OAuth + snapshot rebuild).
//
// Self-contained on purpose (like the old sheet-sync.mjs): its own crypto,
// OAuth token handling, Sheets REST, and Supabase admin client, so the Vercel
// functions that use it (google-callback, sheets-sync) stay isolated with no
// app-build coupling. No googleapis dep — plain fetch + node:crypto.
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ── the six mirrored tabs + PII-excluded column mapping (single source) ──
// row(r) reads a DB row already joined with related plate / names (see fetchTab).
export const SHEET_TABS = ['Cars', 'Reservations', 'Contracts', 'Clients', 'Payments', 'Services']

// Human, French, no database ids. Each header is what a rental-agency owner
// would call the column — never a raw field name (no `odometer_km`, `created_at`,
// no UUIDs). Column order = row() order.
const MAP = {
  vehicles: {
    tab: 'Cars',
    header: ['Plaque', 'Marque', 'Modèle', 'Année', 'Catégorie', 'Prix / jour', 'Statut', 'Kilométrage', 'Assurance', 'Vignette', 'Visite technique', 'Ajoutée le', 'Photo'],
    select: '*',
    row: (r) => [r.plate, r.brand, r.model, r.year, r.category, r.daily_rate, r.status, r.mileage_current, r.insurance_expiry, r.vignette_expiry, r.visite_tech_expiry, dateOnly(r.created_at), imageCell(r.image_keys?.[0])],
  },
  reservations: {
    tab: 'Reservations',
    header: ['Voiture', 'Client', 'Départ', 'Retour', 'Statut', 'Tarif / jour', 'Total', 'Lieu de départ', 'Lieu de retour', 'Créée le'],
    select: '*, vehicles(plate), clients(full_name)',
    row: (r) => [r.vehicles?.plate, r.clients?.full_name, r.date_start, r.date_end, r.status, r.daily_rate_snap, r.total_amount, r.pickup_location, r.dropoff_location, dateOnly(r.created_at)],
  },
  contracts: {
    tab: 'Contracts',
    header: ['Voiture', 'Client', 'Statut', 'Km départ', 'Km retour', 'Carburant départ', 'Carburant retour', 'Caution (MAD)', 'État caution', 'Clôturé le', 'Créé le', 'Contrat'],
    select: '*, reservations(status, vehicles(plate), clients(full_name))',
    row: (r) => [r.reservations?.vehicles?.plate, r.reservations?.clients?.full_name, r.reservations?.status, r.mileage_out, r.mileage_in, r.fuel_out, r.fuel_in, r.check_amount, r.check_status, dateOnly(r.closed_at), dateOnly(r.created_at), pdfCell(r.pdf_key)],
  },
  clients: {
    // PII excluded: no CIN/passport, email, or address.
    tab: 'Clients',
    header: ['Nom complet', 'Téléphone', 'Nationalité', 'Statut', 'Ajouté le'],
    select: 'id, full_name, phone, nationality, status, created_at, agency_id',
    row: (r) => [r.full_name, r.phone, r.nationality, r.status, dateOnly(r.created_at)],
  },
  agency_payments: {
    tab: 'Payments',
    header: ['Montant (MAD)', 'Période', 'Méthode', 'Notes', 'Payé le', 'Créé le'],
    select: '*',
    row: (r) => [r.amount, r.period, r.method, r.notes, dateOnly(r.paid_at), dateOnly(r.created_at)],
  },
  service_records: {
    tab: 'Services',
    header: ['Voiture', 'Type', 'Fait le', 'Kilométrage', 'Coût (MAD)', 'Garage', 'Notes', 'Prochain (km)', 'Prochaine date', 'Créé le'],
    select: '*, vehicles(plate)',
    row: (r) => [r.vehicles?.plate, r.type, r.performed_at, r.odometer_km, r.cost, r.garage, r.notes, r.next_due_km, r.next_due_date, dateOnly(r.created_at)],
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
  return res.json() // { access_token, refresh_token, id_token, expires_in }
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

// Reuse the existing spreadsheet only if THIS token can actually reach it.
// With drive.file the token sees only files the app created for this user, so
// an id left over from the old service-account flow (or another account) 404s —
// in that case we create a fresh sheet. Self-heals a stale stored id.
export async function ensureSpreadsheet(token, existingId, title) {
  if (existingId) {
    const res = await fetch(`${SHEETS}/${existingId}`, { headers: { authorization: `Bearer ${token}` } })
    if (res.ok) {
      const j = await res.json()
      const tabs = {}
      for (const s of j.sheets) tabs[s.properties.title] = s.properties.sheetId
      return { spreadsheetId: j.spreadsheetId, spreadsheetUrl: j.spreadsheetUrl, tabs }
    }
    // 404 / 403 → not ours; fall through and make a new one.
  }
  return createSpreadsheet(token, title)
}

const cell = (v) => (v == null ? '' : v)
// Timestamps → a plain YYYY-MM-DD (owners don't need the time / timezone tail).
const dateOnly = (v) => (v ? String(v).slice(0, 10) : '')

// Public R2 URL helpers. Rendered as Sheets formulas (needs USER_ENTERED):
// car photo shown inline, contract PDF as a clickable link.
const R2_PUBLIC = process.env.R2_PUBLIC_URL || ''
const pub = (key) => (key ? `${R2_PUBLIC}/${key}` : '')
const imageCell = (key) => (key && R2_PUBLIC ? `=IMAGE("${pub(key)}")` : '')
const pdfCell = (key) => (key && R2_PUBLIC ? `=HYPERLINK("${pub(key)}","PDF")` : '')

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
      // USER_ENTERED so =IMAGE()/=HYPERLINK() render (and dates/numbers type
      // naturally). Plain text values are unaffected.
      valueInputOption: 'USER_ENTERED',
      data: tabsData.map((t) => ({ range: `${t.tab}!A1`, values: t.values })),
    }),
  })

  // Make it look designed (best-effort — never fail the sync over styling).
  try {
    await applyFormatting(token, spreadsheetId, tabsData)
  } catch (e) {
    console.error('sheet formatting', e?.message || e)
  }

  return tabsData.reduce((n, t) => n + t.values.length - 1, 0) // total data rows written
}

// ── clean visual styling: brand headers, frozen row, alternating bands,
// auto-sized columns, and taller image rows on the Cars tab. Idempotent
// (deletes existing bands before re-adding), so it's safe every sync.
const RGB_BRAND = { red: 0.114, green: 0.357, blue: 0.553 } // #1d5b8d
const RGB_WHITE = { red: 1, green: 1, blue: 1 }
const RGB_BAND = { red: 0.957, green: 0.965, blue: 0.973 } // #f4f6f8

async function applyFormatting(token, spreadsheetId, tabsData) {
  const meta = await gfetch(
    token,
    `${SHEETS}/${spreadsheetId}?fields=sheets(properties(sheetId,title),bandedRanges(bandedRangeId))`,
  )
  const byTitle = {}
  for (const s of meta.sheets || []) {
    byTitle[s.properties.title] = {
      sheetId: s.properties.sheetId,
      bandings: (s.bandedRanges || []).map((b) => b.bandedRangeId),
    }
  }

  const reqs = []
  for (const t of tabsData) {
    const info = byTitle[t.tab]
    if (!info) continue
    const sheetId = info.sheetId
    const cols = t.values[0]?.length || 1
    const rows = t.values.length

    // freeze the header row
    reqs.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    })
    // header: brand background, white bold text, roomy
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
        cell: {
          userEnteredFormat: {
            backgroundColor: RGB_BRAND,
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            padding: { top: 4, bottom: 4, left: 10, right: 10 },
            textFormat: { bold: true, fontSize: 10, foregroundColor: RGB_WHITE },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,padding,textFormat)',
      },
    })
    // data rows: vertically centered, comfortable font
    if (rows > 1) {
      reqs.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
          cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', textFormat: { fontSize: 10 } } },
          fields: 'userEnteredFormat(verticalAlignment,textFormat)',
        },
      })
    }
    // header row height
    reqs.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 38 },
        fields: 'pixelSize',
      },
    })
    // alternating row bands (delete old first → idempotent)
    for (const bid of info.bandings) reqs.push({ deleteBanding: { bandedRangeId: bid } })
    if (rows > 1) {
      reqs.push({
        addBanding: {
          bandedRange: {
            range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
            rowProperties: { headerColor: RGB_BRAND, firstBandColor: RGB_WHITE, secondBandColor: RGB_BAND },
          },
        },
      })
    }
    // size columns to content
    reqs.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: cols } } })

    // Cars tab: wide photo column + tall rows so the =IMAGE() thumbnails show.
    if (t.tab === 'Cars' && rows > 1) {
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: cols - 1, endIndex: cols },
          properties: { pixelSize: 130 },
          fields: 'pixelSize',
        },
      })
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rows },
          properties: { pixelSize: 84 },
          fields: 'pixelSize',
        },
      })
    }
  }

  if (reqs.length) {
    await gfetch(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: reqs }),
    })
  }
}
