import { createServerFn } from '@tanstack/react-start'
import { requireAgencyContext } from './context'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { listObjects, getObjectBytes, docsBucket } from '~/lib/r2.server'
// Sheets sync engine — shared, self-contained (see api/_google.mjs). Imported
// here so "Sync now" runs in-process (no HTTP hop, no self-URL juggling).
// @ts-ignore — plain .mjs, no type declarations
import { signState, authUrl, decryptToken, accessFromRefresh, syncAgency, ensureFolder, listFolderFiles, uploadPdf } from '../../api/_google.mjs'

export type SheetStatus = {
  configured: boolean // is Google OAuth set up on the server?
  connected: boolean // has this agency linked a Google account?
  enabled: boolean
  url: string | null
  googleEmail: string | null
  lastSyncedAt: string | null
  lastSyncError: string | null
  // Contract-PDF backup to the same connected Drive.
  contractsFolderUrl: string | null
  contractsBackedUpAt: string | null
  contractsBackupError: string | null
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
    .select(
      'enabled, spreadsheet_url, google_email, google_refresh_token_enc, last_synced_at, last_sync_error, drive_contracts_folder_id, contracts_backed_up_at, contracts_backup_error',
    )
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
    contractsFolderUrl: d?.drive_contracts_folder_id
      ? `https://drive.google.com/drive/folders/${d.drive_contracts_folder_id}`
      : null,
    contractsBackedUpAt: d?.contracts_backed_up_at ?? null,
    contractsBackupError: d?.contracts_backup_error ?? null,
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

// Drive-safe filename: strip path separators + collapse whitespace/punctuation
// to single hyphens. Keeps letters (incl. accents), digits, dot, underscore.
function safeName(s: string): string {
  return (s || '')
    .replace(/[\/\\]/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Filename = date_client_car_#shortid.pdf. Meta comes from the DB join; when a
// contract row was deleted the R2 object still exists, so fall back to the
// object's own date and mark it "supprime".
function backupFilename(contractId: string, meta: any, obj: { lastModified: string | null }): string {
  const short = contractId.slice(0, 8)
  const res = meta?.reservations
  if (res) {
    const date = String(res.date_start ?? meta.created_at ?? '').slice(0, 10) || 'sans-date'
    const client = safeName(res.clients?.full_name ?? 'client')
    const v = res.vehicles
    const car = safeName([v?.brand, v?.model, v?.plate].filter(Boolean).join(' ') || 'voiture')
    return `${date}_${client}_${car}_${short}.pdf`
  }
  const date = String(obj.lastModified ?? '').slice(0, 10) || 'sans-date'
  return `${date}_supprime_${short}.pdf`
}

// Owner-only. Back up EVERY generated contract PDF to a folder in the connected
// Google Drive, renamed date_client_car. Enumerates R2 (not the DB) so deleted
// contracts' PDFs are included. Idempotent: re-runs update files in place.
export const backupContractsToDrive = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ uploaded: number; failed: number; folderUrl: string }> => {
    const { agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can back up contracts')
    const admin = getSupabaseAdminClient() as any

    const { data: sheet } = await admin
      .from('agency_sheets')
      .select('google_refresh_token_enc, drive_contracts_folder_id')
      .eq('agency_id', agencyId)
      .maybeSingle()
    if (!sheet?.google_refresh_token_enc) throw new Error('Google account not connected')

    try {
      const token = await accessFromRefresh(decryptToken(sheet.google_refresh_token_enc))

      const { data: agency } = await admin.from('agencies').select('name').eq('id', agencyId).maybeSingle()
      const folderId = await ensureFolder(token, `Contrats — ${agency?.name ?? 'Agence'}`, sheet.drive_contracts_folder_id)

      // Naming metadata for contracts that still have a DB row.
      const { data: contracts } = await admin
        .from('contracts')
        .select('id, created_at, reservations(date_start, clients(full_name), vehicles(brand, model, plate))')
        .eq('agency_id', agencyId)
      const meta = new Map<string, any>()
      for (const c of contracts ?? []) meta.set(c.id, c)

      const objects = (await listObjects(`agencies/${agencyId}/contracts/`, docsBucket())).filter((o) =>
        o.key.endsWith('.pdf'),
      )
      const existing: Record<string, string> = await listFolderFiles(token, folderId)

      let uploaded = 0
      let failed = 0
      const errors: string[] = []
      for (const obj of objects) {
        const contractId = obj.key.split('/').pop()!.replace(/\.pdf$/, '')
        const name = backupFilename(contractId, meta.get(contractId), obj)
        try {
          const bytes = await getObjectBytes(obj.key, docsBucket())
          await uploadPdf(token, folderId, name, bytes, existing[name])
          uploaded++
        } catch (e: any) {
          failed++
          errors.push(`${name}: ${String(e?.message || e)}`)
        }
      }

      const errorText = errors.length ? errors.slice(0, 5).join(' | ') : null
      await admin
        .from('agency_sheets')
        .update({
          drive_contracts_folder_id: folderId,
          contracts_backed_up_at: new Date().toISOString(),
          contracts_backup_error: errorText,
        })
        .eq('agency_id', agencyId)

      return { uploaded, failed, folderUrl: `https://drive.google.com/drive/folders/${folderId}` }
    } catch (err: any) {
      const msg = String(err?.message || err)
      await admin.from('agency_sheets').update({ contracts_backup_error: msg }).eq('agency_id', agencyId)
      throw new Error(msg)
    }
  },
)

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
