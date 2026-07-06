import { createServerFn } from '@tanstack/react-start'
import { requireAgencyContext } from './context'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
// Sheets sync engine — shared, self-contained (see api/_google.mjs). Imported
// here so "Sync now" runs in-process (no HTTP hop, no self-URL juggling).
// @ts-ignore — plain .mjs, no type declarations
import { signState, authUrl, decryptToken, accessFromRefresh, syncAgency } from '../../api/_google.mjs'

export type SheetStatus = {
  configured: boolean // is Google OAuth set up on the server?
  connected: boolean // has this agency linked a Google account?
  enabled: boolean
  url: string | null
  googleEmail: string | null
  lastSyncedAt: string | null
  lastSyncError: string | null
}

// All five OAuth env vars must be present for the feature to work.
function oauthConfigured(): boolean {
  const e = process.env
  return !!(
    e.GOOGLE_OAUTH_CLIENT_ID &&
    e.GOOGLE_OAUTH_CLIENT_SECRET &&
    e.GOOGLE_OAUTH_REDIRECT_URI &&
    e.SHEETS_TOKEN_KEY &&
    e.CRON_SECRET
  )
}

export const getSheetStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<SheetStatus> => {
  const { supabase, agencyId } = await requireAgencyContext()
  const { data } = await supabase
    .from('agency_sheets')
    .select('enabled, spreadsheet_url, google_email, google_refresh_token_enc, last_synced_at, last_sync_error')
    .eq('agency_id', agencyId)
    .maybeSingle()
  const d = data as any
  return {
    configured: oauthConfigured(),
    connected: !!d?.google_refresh_token_enc,
    enabled: !!d?.enabled,
    url: d?.spreadsheet_url ?? null,
    googleEmail: d?.google_email ?? null,
    lastSyncedAt: d?.last_synced_at ?? null,
    lastSyncError: d?.last_sync_error ?? null,
  }
})

// Owner-only. Returns the Google consent URL; the client redirects to it.
export const getGoogleAuthUrl = createServerFn({ method: 'POST' }).handler(async (): Promise<{ url: string }> => {
  const { agencyId, role } = await requireAgencyContext()
  if (role !== 'owner') throw new Error('Only the owner can connect Google Sheets')
  if (!oauthConfigured()) throw new Error('Google Sheets is not configured on the server')
  return { url: authUrl(signState(agencyId)) }
})

// Owner-only. Snapshot-rebuild this agency's sheet right now (in-process).
export const syncNow = createServerFn({ method: 'POST' }).handler(async (): Promise<{ rows: number }> => {
  const { agencyId, role } = await requireAgencyContext()
  if (role !== 'owner') throw new Error('Only the owner can sync')
  const admin = getSupabaseAdminClient() as any
  const { data: sheet } = await admin
    .from('agency_sheets')
    .select('spreadsheet_id, google_refresh_token_enc')
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!sheet?.google_refresh_token_enc || !sheet.spreadsheet_id) throw new Error('Google account not connected')
  try {
    const token = await accessFromRefresh(decryptToken(sheet.google_refresh_token_enc))
    const rows = await syncAgency(admin, token, sheet.spreadsheet_id, agencyId)
    await admin
      .from('agency_sheets')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('agency_id', agencyId)
    return { rows }
  } catch (err: any) {
    const msg = String(err?.message || err)
    await admin.from('agency_sheets').update({ last_sync_error: msg }).eq('agency_id', agencyId)
    throw new Error(msg)
  }
})

// Owner-only. Disconnect: drop the token and stop syncing. The spreadsheet
// itself stays in the owner's Drive untouched.
export const disconnectSheet = createServerFn({ method: 'POST' }).handler(async (): Promise<{ ok: true }> => {
  const { agencyId, role } = await requireAgencyContext()
  if (role !== 'owner') throw new Error('Only the owner can disconnect')
  const admin = getSupabaseAdminClient() as any
  await admin
    .from('agency_sheets')
    .update({
      enabled: false,
      google_refresh_token_enc: null,
      google_email: null,
      updated_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
  return { ok: true }
})
