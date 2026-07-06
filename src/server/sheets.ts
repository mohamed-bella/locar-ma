import { createServerFn } from '@tanstack/react-start'
import { requireAgencyContext } from './context'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { sheetsConfigured, createSpreadsheet, shareFile, linkExistingSpreadsheet } from '~/lib/googleSheets.server'

// The six mirrored tabs (must match the table→tab map in api/sheet-sync.mjs).
export const SHEET_TABS = ['Cars', 'Reservations', 'Contracts', 'Clients', 'Payments', 'Services'] as const

export type SheetStatus = {
  configured: boolean // is the platform's Google service account set up?
  enabled: boolean
  url: string | null
  serviceAccountEmail: string | null
}

export const getSheetStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<SheetStatus> => {
  const { supabase, agencyId } = await requireAgencyContext()
  const { data } = await supabase
    .from('agency_sheets')
    .select('enabled, spreadsheet_url')
    .eq('agency_id', agencyId)
    .maybeSingle()
  return {
    configured: sheetsConfigured(),
    enabled: !!(data as any)?.enabled,
    url: (data as any)?.spreadsheet_url ?? null,
    serviceAccountEmail: sheetsConfigured() ? (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null) : null,
  }
})

// Owner-only. Creates (or re-enables) the agency's mirror spreadsheet.
export const enableSheetSync = createServerFn({ method: 'POST' })
  .validator((d: { spreadsheetUrl?: string } | undefined) => d)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can enable the spreadsheet sync')
    if (!sheetsConfigured()) throw new Error('Google Sheets is not configured on the server')

    const admin = getSupabaseAdminClient() as any
    const spreadsheetUrlInput = data?.spreadsheetUrl?.trim()

    // 1. If linking to an existing manual spreadsheet
    if (spreadsheetUrlInput) {
      const result = await linkExistingSpreadsheet(spreadsheetUrlInput, [...SHEET_TABS])
      const { error } = await admin.from('agency_sheets').upsert({
        agency_id: agencyId,
        spreadsheet_id: result.spreadsheetId,
        spreadsheet_url: result.spreadsheetUrl,
        tabs: result.tabs,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agency_id' })

      if (error) throw new Error(`Database error saving sync configuration: ${error.message}`)
      return { url: result.spreadsheetUrl }
    }

    // 2. Auto-create (original flow) / reuse existing configuration
    const { data: existing } = await admin
      .from('agency_sheets')
      .select('spreadsheet_url')
      .eq('agency_id', agencyId)
      .maybeSingle()
    if (existing) {
      await admin.from('agency_sheets').update({ enabled: true, updated_at: new Date().toISOString() }).eq('agency_id', agencyId)
      return { url: (existing as any).spreadsheet_url }
    }

    const [{ data: agency }, { data: userData }] = await Promise.all([
      supabase.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
      supabase.auth.getUser(),
    ])
    const name = (agency as any)?.name ?? 'Agency'
    const ownerEmail = userData?.user?.email ?? null

    let created
    try {
      created = await createSpreadsheet(`Locar — ${name}`, [...SHEET_TABS])
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      if (errMsg.includes('403') || errMsg.includes('quota') || errMsg.includes('permission')) {
        throw new Error(
          `Google Sheets auto-creation failed due to Service Account quota limits. ` +
          `To fix this, please create a spreadsheet in your Google Drive, share it with the service account, and paste the URL below.`
        )
      }
      throw err
    }

    // Best-effort share to the owner so they can open it immediately.
    if (ownerEmail) {
      try {
        await shareFile(created.spreadsheetId, ownerEmail, 'writer')
      } catch {
        /* sharing is non-fatal — the sheet still syncs */
      }
    }

    await admin.from('agency_sheets').insert({
      agency_id: agencyId,
      spreadsheet_id: created.spreadsheetId,
      spreadsheet_url: created.spreadsheetUrl,
      tabs: created.tabs,
      enabled: true,
    })
    return { url: created.spreadsheetUrl }
  })

export const disableSheetSync = createServerFn({ method: 'POST' }).handler(async () => {
  const { agencyId, role } = await requireAgencyContext()
  if (role !== 'owner') throw new Error('Only the owner can change the spreadsheet sync')
  const admin = getSupabaseAdminClient() as any
  await admin.from('agency_sheets').update({ enabled: false, updated_at: new Date().toISOString() }).eq('agency_id', agencyId)
  return { ok: true }
})
