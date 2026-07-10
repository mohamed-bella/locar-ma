import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { presignDownload, docsBucket } from '~/lib/r2.server'

export type NotificationType =
  | 'reservation_created'
  | 'reservation_cancelled'
  | 'contract_created'
  | 'contract_signed'
  | 'vehicle_added'
  | 'service_record_created'
  | 'contract_pdf_ready'

// Enqueue a WhatsApp notification. Best-effort — never throws.
// Uses admin client so it bypasses RLS (server-side only).
export async function enqueueNotification(
  agencyId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = getSupabaseAdminClient()

    // Respect the per-agency WhatsApp switch — if paused, don't enqueue at all.
    const { data: agency } = await admin
      .from('agencies')
      .select('whatsapp_enabled')
      .eq('id', agencyId)
      .maybeSingle()
    if (agency && (agency as any).whatsapp_enabled === false) {
      console.log(`[notify] skipped type=${type} agency=${agencyId} — WhatsApp disabled`)
      return
    }

    // NOTE: .insert() RESOLVES with { error } on failure — it does NOT throw.
    // Must inspect the returned error explicitly or failures are invisible.
    const { data, error } = await admin
      .from('notification_queue')
      .insert({ agency_id: agencyId, type, payload })
      .select('id')
      .single()
    if (error) {
      console.error(`[notify] enqueue FAILED type=${type} agency=${agencyId}:`, error.message)
      return
    }
    console.log(`[notify] enqueued type=${type} agency=${agencyId} id=${(data as any)?.id}`)
  } catch (e) {
    console.error(`[notify] enqueue threw type=${type} agency=${agencyId}:`, e)
  }
}

// Convenience: enqueue with full reservation context for the bot to format.
export async function enqueueReservationNotification(
  agencyId: string,
  reservationId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient()
  const { data: r, error } = await admin
    .from('reservations')
    .select(
      'id, date_start, date_end, total_amount, status, vehicles(plate, brand, model), clients(full_name, phone)',
    )
    .eq('id', reservationId)
    .maybeSingle()
  if (error) {
    console.error(`[notify] reservation lookup failed id=${reservationId}:`, error.message)
    return
  }
  if (!r) {
    console.warn(`[notify] reservation not found id=${reservationId} — skipping`)
    return
  }

  const res = r as any
  await enqueueNotification(agencyId, 'reservation_created', {
    reservation_id: res.id,
    vehicle: [res.vehicles?.brand, res.vehicles?.model].filter(Boolean).join(' ') || res.vehicles?.plate,
    plate: res.vehicles?.plate,
    client: res.clients?.full_name,
    client_phone: res.clients?.phone,
    date_start: res.date_start,
    date_end: res.date_end,
    total_amount: res.total_amount,
    status: res.status,
  })
}

export async function enqueueContractNotification(
  agencyId: string,
  contractId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient()
  const { data: c } = await admin
    .from('contracts')
    .select(
      'id, pdf_key, check_amount, reservations(date_start, date_end, vehicles(plate, brand, model), clients(full_name, phone))',
    )
    .eq('id', contractId)
    .maybeSingle()
  if (!c) return

  const con = c as any
  const res = con.reservations
  await enqueueNotification(agencyId, 'contract_created', {
    contract_id: con.id,
    vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate,
    plate: res?.vehicles?.plate,
    client: res?.clients?.full_name,
    client_phone: res?.clients?.phone,
    date_start: res?.date_start,
    date_end: res?.date_end,
    check_amount: con.check_amount,
    pdf_key: con.pdf_key,
  })
}

export async function enqueueVehicleNotification(
  agencyId: string,
  vehicleId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient()
  const { data: v } = await admin
    .from('vehicles')
    .select('plate, brand, model, year, category, daily_rate, status')
    .eq('id', vehicleId)
    .maybeSingle()
  if (!v) return

  await enqueueNotification(agencyId, 'vehicle_added', {
    vehicle_id: vehicleId,
    vehicle: [v.brand, v.model].filter(Boolean).join(' ') || v.plate,
    plate: v.plate,
    year: v.year,
    category: v.category,
    daily_rate: v.daily_rate,
    status: v.status,
  })
}

export async function enqueuePdfNotification(agencyId: string, contractId: string): Promise<void> {
  const admin = getSupabaseAdminClient()
  const { data: c } = await admin
    .from('contracts')
    .select('pdf_key, reservations(vehicles(plate, brand, model), clients(full_name))')
    .eq('id', contractId)
    .maybeSingle()

  const con = c as any
  if (!con?.pdf_key) return
  const res = con?.reservations

  // Presign from the PRIVATE bucket (max 7 days) so the bot can attach the file
  // without any public URL ever existing. Short-lived + unguessable.
  const pdfUrl = await presignDownload(con.pdf_key, 7 * 24 * 3600, docsBucket())

  await enqueueNotification(agencyId, 'contract_pdf_ready', {
    contract_id: contractId,
    vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate,
    plate: res?.vehicles?.plate,
    client: res?.clients?.full_name,
    pdf_url: pdfUrl,
  })
}
