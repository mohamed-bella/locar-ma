// OAuth redirect target — Google sends the user's browser here after consent.
// Verifies the signed state (binds to an agency), exchanges the code for a
// refresh token, creates the agency's spreadsheet in THEIR Drive (if not yet),
// stores the encrypted token, and runs a first snapshot sync. Then redirects
// back to Settings.
import {
  admin, verifyState, exchangeCode, emailFromIdToken, encryptToken,
  accessFromRefresh, createSpreadsheet, syncAgency,
} from './_google.mjs'

export const config = { maxDuration: 30 }

function redirect(res, path) {
  res.statusCode = 302
  res.setHeader('location', path)
  res.end()
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://x')
    const err = url.searchParams.get('error')
    if (err) return redirect(res, `/settings?sheet=error&reason=${encodeURIComponent(err)}`)

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const agencyId = state && verifyState(state)
    if (!code || !agencyId) return redirect(res, '/settings?sheet=error&reason=bad_state')

    const tokens = await exchangeCode(code)
    const email = emailFromIdToken(tokens.id_token || '')
    const supa = admin()

    // Existing config? reuse spreadsheet; only refresh the token if Google sent one.
    const { data: existing } = await supa
      .from('agency_sheets')
      .select('spreadsheet_id, spreadsheet_url, tabs, google_refresh_token_enc')
      .eq('agency_id', agencyId)
      .maybeSingle()

    const refreshEnc = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing?.google_refresh_token_enc
    if (!refreshEnc) return redirect(res, '/settings?sheet=error&reason=no_refresh_token')

    const accessToken = tokens.access_token || (await accessFromRefresh(tokens.refresh_token))

    let spreadsheetId = existing?.spreadsheet_id
    let spreadsheetUrl = existing?.spreadsheet_url
    let tabs = existing?.tabs
    if (!spreadsheetId) {
      const created = await createSpreadsheet(accessToken, 'Locar — Sync')
      spreadsheetId = created.spreadsheetId
      spreadsheetUrl = created.spreadsheetUrl
      tabs = created.tabs
    }

    await supa.from('agency_sheets').upsert({
      agency_id: agencyId,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      tabs,
      google_refresh_token_enc: refreshEnc,
      google_email: email,
      enabled: true,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agency_id' })

    // First fill — best-effort; a failure here shouldn't break the connect flow.
    try {
      await syncAgency(supa, accessToken, spreadsheetId, agencyId)
      await supa.from('agency_sheets').update({ last_synced_at: new Date().toISOString() }).eq('agency_id', agencyId)
    } catch (e) {
      await supa.from('agency_sheets').update({ last_sync_error: String(e?.message || e) }).eq('agency_id', agencyId)
    }

    return redirect(res, '/settings?sheet=connected')
  } catch (e) {
    console.error('google-callback', e)
    return redirect(res, `/settings?sheet=error&reason=${encodeURIComponent(e?.message || 'unknown')}`)
  }
}
