// Supabase Database Webhook → Google Sheets one-way sync (DB → Sheet).
//
// Supabase POSTs { type, table, record, old_record, schema } on every
// INSERT/UPDATE/DELETE of a mirrored table. We look up the agency's spreadsheet
// and upsert the row, keyed by its id in column A. Self-contained on purpose:
// its own service-account JWT + Sheets REST calls, so it stays an isolated
// Vercel function with no app-build coupling.
import { createSign } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 20 }

// ── table → tab + PII-excluded column mapping ──
const MAP = {
  vehicles: {
    tab: 'Cars',
    header: ['id', 'plate', 'brand', 'model', 'year', 'category', 'daily_rate', 'status', 'mileage_current', 'insurance_expiry', 'vignette_expiry', 'visite_tech_expiry', 'created_at'],
    row: (r) => [r.id, r.plate, r.brand, r.model, r.year, r.category, r.daily_rate, r.status, r.mileage_current, r.insurance_expiry, r.vignette_expiry, r.visite_tech_expiry, r.created_at],
  },
  reservations: {
    tab: 'Reservations',
    header: ['id', 'vehicle_plate', 'client_name', 'date_start', 'date_end', 'status', 'daily_rate_snap', 'total_amount', 'pickup_location', 'dropoff_location', 'created_at'],
    row: (r, e) => [r.id, e.plate, e.client_name, r.date_start, r.date_end, r.status, r.daily_rate_snap, r.total_amount, r.pickup_location, r.dropoff_location, r.created_at],
  },
  contracts: {
    tab: 'Contracts',
    header: ['id', 'reservation_id', 'vehicle_plate', 'client_name', 'status', 'mileage_out', 'mileage_in', 'fuel_out', 'fuel_in', 'check_amount', 'check_status', 'closed_at', 'created_at'],
    row: (r, e) => [r.id, r.reservation_id, e.plate, e.client_name, e.status, r.mileage_out, r.mileage_in, r.fuel_out, r.fuel_in, r.check_amount, r.check_status, r.closed_at, r.created_at],
  },
  clients: {
    // PII excluded: no CIN/passport, email, or address.
    tab: 'Clients',
    header: ['id', 'full_name', 'phone', 'nationality', 'status', 'created_at'],
    row: (r) => [r.id, r.full_name, r.phone, r.nationality, r.status, r.created_at],
  },
  agency_payments: {
    tab: 'Payments',
    header: ['id', 'amount', 'period', 'method', 'notes', 'paid_at', 'created_at'],
    row: (r) => [r.id, r.amount, r.period, r.method, r.notes, r.paid_at, r.created_at],
  },
  service_records: {
    tab: 'Services',
    header: ['id', 'vehicle_plate', 'type', 'performed_at', 'odometer_km', 'cost', 'garage', 'notes', 'next_due_km', 'next_due_date', 'created_at'],
    row: (r, e) => [r.id, e.plate, r.type, r.performed_at, r.odometer_km, r.cost, r.garage, r.notes, r.next_due_km, r.next_due_date, r.created_at],
  },
}

// ── Google auth (service account JWT → access token) ──
let tokenCache = null
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Google service account not configured')
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  signer.end()
  const jwt = `${header}.${claims}.${b64url(signer.sign(key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`)
  const j = await res.json()
  tokenCache = { token: j.access_token, exp: now + j.expires_in }
  return j.access_token
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
async function gfetch(token, url, init) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(`sheets ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
const cell = (v) => (v == null ? '' : v)
function colLetter(n) {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// ── enrichment (plate / client name via service role) ──
async function enrich(supa, table, record) {
  const out = { plate: '', client_name: '', status: '' }
  try {
    if (table === 'reservations' || table === 'service_records') {
      if (record.vehicle_id) {
        const { data } = await supa.from('vehicles').select('plate').eq('id', record.vehicle_id).maybeSingle()
        out.plate = data?.plate ?? ''
      }
      if (table === 'reservations' && record.client_id) {
        const { data } = await supa.from('clients').select('full_name').eq('id', record.client_id).maybeSingle()
        out.client_name = data?.full_name ?? ''
      }
    } else if (table === 'contracts' && record.reservation_id) {
      const { data: r } = await supa.from('reservations').select('status, vehicle_id, client_id').eq('id', record.reservation_id).maybeSingle()
      out.status = r?.status ?? ''
      if (r?.vehicle_id) {
        const { data } = await supa.from('vehicles').select('plate').eq('id', r.vehicle_id).maybeSingle()
        out.plate = data?.plate ?? ''
      }
      if (r?.client_id) {
        const { data } = await supa.from('clients').select('full_name').eq('id', r.client_id).maybeSingle()
        out.client_name = data?.full_name ?? ''
      }
    }
  } catch {
    /* enrichment is best-effort */
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return }
  if ((req.headers['x-sheet-secret'] || '') !== (process.env.SHEET_SYNC_SECRET || '\0')) {
    res.statusCode = 401; res.end('unauthorized'); return
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(await readBody(req))
    const { type, table, record, old_record } = body
    const map = MAP[table]
    if (!map) { res.statusCode = 200; res.end('ignored'); return }

    const row = record || old_record || {}
    const agencyId = row.agency_id
    if (!agencyId) { res.statusCode = 200; res.end('no agency'); return }

    const supa = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { data: sheet } = await supa.from('agency_sheets').select('spreadsheet_id, tabs, enabled').eq('agency_id', agencyId).maybeSingle()
    if (!sheet || !sheet.enabled) { res.statusCode = 200; res.end('sync off'); return }

    const token = await getAccessToken()
    const id = sheet.spreadsheet_id
    const tab = map.tab
    const gid = sheet.tabs?.[tab]

    // Column A (ids). Ensure the header row exists first.
    const got = await gfetch(token, `${SHEETS}/${id}/values/${tab}!A:A`)
    let colA = (got.values || []).map((r) => r[0])
    if (colA.length === 0 || colA[0] !== 'id') {
      const end = colLetter(map.header.length)
      await gfetch(token, `${SHEETS}/${id}/values/${tab}!A1:${end}1?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [map.header] }),
      })
      colA = ['id']
    }

    const targetId = (record || old_record).id
    const idx = colA.findIndex((v, i) => i > 0 && v === targetId) // skip header

    if (type === 'DELETE') {
      if (idx > 0 && gid != null) {
        await gfetch(token, `${SHEETS}/${id}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] }),
        })
      }
      res.statusCode = 200; res.end('deleted'); return
    }

    const e = await enrich(supa, table, record)
    const values = [map.row(record, e).map(cell)]
    const end = colLetter(map.header.length)

    if (idx > 0) {
      const rowNum = idx + 1 // 1-based
      await gfetch(token, `${SHEETS}/${id}/values/${tab}!A${rowNum}:${end}${rowNum}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values }),
      })
    } else {
      await gfetch(token, `${SHEETS}/${id}/values/${tab}!A1:${end}1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      })
    }

    res.statusCode = 200; res.end('ok')
  } catch (err) {
    console.error('sheet-sync', err)
    res.statusCode = 500 // Supabase will retry
    res.end('error: ' + (err?.message || String(err)))
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data || '{}'))
    req.on('error', reject)
  })
}
