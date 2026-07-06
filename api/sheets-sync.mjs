// Snapshot sync endpoint.
//   GET  → cron: rebuild EVERY enabled+connected agency. Auth: Bearer CRON_SECRET
//          (Vercel Cron sends this automatically when CRON_SECRET is set).
//   POST → one agency: body { agencyId }. Auth: x-cron-secret header.
//          Called by the app's "Sync now" server function.
import { admin, decryptToken, accessFromRefresh, syncAgency } from './_google.mjs'

export const config = { maxDuration: 60 }

async function syncOne(supa, sheet) {
  try {
    if (!sheet.google_refresh_token_enc || !sheet.spreadsheet_id) return { id: sheet.agency_id, skipped: true }
    const refresh = decryptToken(sheet.google_refresh_token_enc)
    const token = await accessFromRefresh(refresh)
    const rows = await syncAgency(supa, token, sheet.spreadsheet_id, sheet.agency_id)
    await supa.from('agency_sheets')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('agency_id', sheet.agency_id)
    return { id: sheet.agency_id, rows }
  } catch (e) {
    await supa.from('agency_sheets')
      .update({ last_sync_error: String(e?.message || e) })
      .eq('agency_id', sheet.agency_id)
    return { id: sheet.agency_id, error: String(e?.message || e) }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c) => (d += c))
    req.on('end', () => resolve(d || '{}'))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || '\0'
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  const header = req.headers['x-cron-secret'] || ''
  if (bearer !== secret && header !== secret) {
    res.statusCode = 401; res.end('unauthorized'); return
  }

  const supa = admin()
  const cols = 'agency_id, spreadsheet_id, google_refresh_token_enc, enabled'

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(await readBody(req))
      const agencyId = body?.agencyId
      if (!agencyId) { res.statusCode = 400; res.end('agencyId required'); return }
      const { data: sheet } = await supa.from('agency_sheets').select(cols).eq('agency_id', agencyId).maybeSingle()
      if (!sheet || !sheet.enabled) { res.statusCode = 200; res.end(JSON.stringify({ skipped: true })); return }
      const result = await syncOne(supa, sheet)
      res.statusCode = result.error ? 500 : 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
      return
    }

    // GET → cron: all enabled + connected agencies
    const { data: sheets } = await supa.from('agency_sheets')
      .select(cols).eq('enabled', true).not('google_refresh_token_enc', 'is', null)
    const results = []
    for (const s of sheets || []) results.push(await syncOne(supa, s))
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ count: results.length, results }))
  } catch (e) {
    console.error('sheets-sync', e)
    res.statusCode = 500; res.end('error: ' + (e?.message || String(e)))
  }
}
