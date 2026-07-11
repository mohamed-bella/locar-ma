import { createFileRoute } from '@tanstack/react-router'
import { requireMobileAuth, json, parseJsonBody, type MobileContext } from '~/lib/mobile-auth.server'
import { syncVehicleStatus } from '~/server/vehicleStatus'
import { advanceVehicleMileage } from '~/server/mileage'
import { presignUpload, presignDownload, putObject, publicUrl, docsBucket } from '~/lib/r2.server'
import { enqueueReservationNotification, enqueueContractNotification, enqueueNotification, enqueueVehicleNotification } from '~/server/notifications'
import { emailConfigured, notifyNewReservation, notifyNewContract, notifyVehicle, scheduleNotify } from '~/lib/email.server'
import { agencyToday } from '~/lib/tz'
import { resolvePlan, type PlanRow } from '~/lib/maintenance'
import { randomBytes } from 'node:crypto'
import { addMonths, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

// Mobile API — JWT-authenticated endpoints that wrap the same server logic the
// web app uses, so the native Android app gets vehicle status sync, forward-only
// mileage, compliance checks, and atomic close-rental for free.
//
// All routes are under /mobile-api/* (NOT /api/* — Vercel reserves that prefix).
// Auth: Authorization: Bearer <supabase_access_token>

type Handler = (ctx: MobileContext, request: Request) => Promise<Response>

const handlers: Record<string, { method: 'GET' | 'POST'; handler: Handler }> = {}

function get(action: string, handler: Handler) { handlers[action] = { method: 'GET', handler } }
function post(action: string, handler: Handler) { handlers[action] = { method: 'POST', handler } }

// ── Reservations ────────────────────────────────────────────────────────────

post('create-reservation', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body) return json({ error: 'Invalid JSON' }, 400)
  const { admin, agencyId, memberId } = ctx

  const vehicleId = body.vehicle_id
  const clientId = body.client_id
  const dateStart = body.date_start
  const dateEnd = body.date_end
  if (!vehicleId || !clientId || !dateStart || !dateEnd) {
    return json({ error: 'vehicle_id, client_id, date_start, date_end required' }, 400)
  }

  const startMs = new Date(`${dateStart}T00:00:00Z`).getTime()
  const endMs = new Date(`${dateEnd}T00:00:00Z`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return json({ error: 'invalid reservation dates' }, 400)
  }

  const [{ data: vehicle }, { data: client }] = await Promise.all([
    admin.from('vehicles').select('id, daily_rate').eq('id', vehicleId).eq('agency_id', agencyId).maybeSingle(),
    admin.from('clients').select('id, status').eq('id', clientId).eq('agency_id', agencyId).maybeSingle(),
  ])
  if (!vehicle || !client) return json({ error: 'Vehicle or client not found in this agency' }, 404)
  if (['blacklisted', 'blocked'].includes((client as any).status)) {
    return json({ error: 'This client is blocked' }, 409)
  }

  let rate = body.daily_rate_snap
  if (rate == null) {
    rate = (vehicle as any).daily_rate ?? 0
  }
  rate = Number(rate)
  if (!Number.isFinite(rate) || rate < 0) return json({ error: 'invalid daily rate' }, 400)
  const days = Math.max(1, Math.round(
    (endMs - startMs) / 86_400_000
  ))
  const total = body.total_amount == null ? Number(rate) * days : Number(body.total_amount)
  if (!Number.isFinite(total) || total < 0) return json({ error: 'invalid total amount' }, 400)

  const { data: row, error } = await admin
    .from('reservations')
    .insert({
      agency_id: agencyId,
      vehicle_id: vehicleId,
      client_id: clientId,
      date_start: dateStart,
      date_end: dateEnd,
      pickup_location: body.pickup_location ?? null,
      dropoff_location: body.dropoff_location ?? null,
      status: 'confirmed',
      daily_rate_snap: rate,
      total_amount: total,
      notes: body.notes ?? null,
      created_by: memberId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23P01') return json({ error: 'Dates overlap an existing booking for this vehicle' }, 409)
    return json({ error: error.message }, 500)
  }

  await syncVehicleStatus(admin, vehicleId)
  const newId = (row as any).id as string
  scheduleNotify(() => notifyNewReservation(agencyId, newId))
  // Persist the bot event before reporting success. Email can remain backgrounded,
  // but the WhatsApp queue must not depend on a serverless function staying alive.
  const whatsappQueued = await enqueueReservationNotification(agencyId, newId)
  return json({
    id: newId,
    notifications: {
      whatsapp: whatsappQueued ? 'queued' : 'disabled_or_unavailable',
      email: emailConfigured() ? 'scheduled' : 'not_configured',
    },
  })
})

post('set-reservation-status', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.id || !body?.status) return json({ error: 'id, status required' }, 400)
  if (body.status !== 'cancelled') return json({ error: 'Only reservation cancellation is supported here' }, 400)
  const { admin, agencyId } = ctx

  const { data: row, error } = await admin
    .from('reservations')
    .update({ status: body.status })
    .eq('id', body.id)
    .eq('agency_id', agencyId)
    .select('vehicle_id')
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!row) return json({ error: 'Reservation not found' }, 404)

  await syncVehicleStatus(admin, (row as any).vehicle_id)

  if (body.status === 'cancelled') {
    const { data: r } = await admin
      .from('reservations')
      .select('id, date_start, date_end, vehicles(plate, brand, model), clients(full_name, phone)')
      .eq('id', body.id)
      .maybeSingle()
    const res = r as any
    await enqueueNotification(agencyId, 'reservation_cancelled', {
      reservation_id: res?.id ?? body.id,
      vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate,
      plate: res?.vehicles?.plate,
      client: res?.clients?.full_name,
      client_phone: res?.clients?.phone,
      date_start: res?.date_start,
      date_end: res?.date_end,
    })
  }
  return json({ ok: true })
})

// ── Contracts ───────────────────────────────────────────────────────────────

post('create-contract', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.reservation_id) return json({ error: 'reservation_id required' }, 400)
  const { admin, agencyId } = ctx

  const { data: res, error: resErr } = await admin
    .from('reservations')
    .select('id, vehicle_id, vehicles(mileage_current)')
    .eq('id', body.reservation_id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (resErr) return json({ error: resErr.message }, 500)
  if (!res) return json({ error: 'Reservation not found' }, 404)

  // Reuse existing contract
  const { data: existing } = await admin
    .from('contracts')
    .select('id')
    .eq('reservation_id', body.reservation_id)
    .maybeSingle()
  if (existing) return json({ id: (existing as any).id, reused: true })

  const { data: row, error } = await admin
    .from('contracts')
    .insert({
      agency_id: agencyId,
      reservation_id: body.reservation_id,
      mileage_out: (res as any).vehicles?.mileage_current ?? null,
      check_status: 'held',
      extras: [],
    })
    .select('id')
    .single()
  if (error) return json({ error: error.message }, 500)

  await admin.from('reservations').update({ status: 'active' }).eq('id', body.reservation_id)
  if ((res as any).vehicle_id) await syncVehicleStatus(admin, (res as any).vehicle_id)

  scheduleNotify(() => notifyNewContract(agencyId, (row as any).id))
  await enqueueContractNotification(agencyId, (row as any).id)
  return json({ id: (row as any).id })
})

post('update-contract', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.id) return json({ error: 'id required' }, 400)
  const { admin, agencyId } = ctx

  const patch: Record<string, any> = {}
  for (const k of ['mileage_out', 'mileage_in', 'fuel_out', 'fuel_in', 'check_number', 'check_bank', 'check_amount', 'check_status', 'extras', 'form']) {
    if (body[k] !== undefined) patch[k] = body[k]
  }

  const { error } = await admin.from('contracts').update(patch).eq('id', body.id).eq('agency_id', agencyId)
  if (error) return json({ error: error.message }, 500)

  const reading = body.mileage_in ?? body.mileage_out
  if (reading != null) {
    const { data: c } = await admin
      .from('contracts')
      .select('reservations(vehicle_id)')
      .eq('id', body.id)
      .maybeSingle()
    await advanceVehicleMileage(admin, (c as any)?.reservations?.vehicle_id, reading)
  }
  return json({ ok: true })
})

post('close-contract', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.id) return json({ error: 'id required' }, 400)
  const { admin, agencyId } = ctx

  const { data: c } = await admin
    .from('contracts')
    .select('reservation_id, reservations(vehicle_id, date_start, date_end, vehicles(plate, brand, model), clients(full_name, phone))')
    .eq('id', body.id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!c) return json({ error: 'Contract not found' }, 404)

  const { error } = await admin
    .from('contracts')
    .update({
      mileage_in: body.mileage_in ?? null,
      fuel_in: body.fuel_in ?? null,
      closed_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('agency_id', agencyId)
  if (error) return json({ error: error.message }, 500)

  const reservationId = (c as any)?.reservation_id
  const vehicleId = (c as any)?.reservations?.vehicle_id
  if (reservationId) await admin.from('reservations').update({ status: 'closed' }).eq('id', reservationId).eq('agency_id', agencyId)
  await advanceVehicleMileage(admin, vehicleId, body.mileage_in ?? null)
  if (vehicleId) await syncVehicleStatus(admin, vehicleId)

  const res = (c as any)?.reservations
  await enqueueNotification(agencyId, 'contract_closed', {
    contract_id: body.id,
    reservation_id: reservationId,
    vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate,
    plate: res?.vehicles?.plate,
    client: res?.clients?.full_name,
    client_phone: res?.clients?.phone,
    date_start: res?.date_start,
    date_end: res?.date_end,
    mileage_in: body.mileage_in ?? null,
  })

  return json({ ok: true })
})

// ── Signatures ──────────────────────────────────────────────────────────────

post('create-sign-link', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.contract_id) return json({ error: 'contract_id required' }, 400)
  const { admin, agencyId } = ctx

  const { data: row } = await admin
    .from('contracts')
    .select('id, signed_at')
    .eq('id', body.contract_id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!row) return json({ error: 'Contract not found' }, 404)
  if ((row as any).signed_at) return json({ error: 'Ce contrat est déjà signé.' }, 409)

  const token = randomBytes(24).toString('base64url')
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const { error } = await admin
    .from('contracts')
    .update({ sign_token: token, sign_token_expires: expires })
    .eq('id', body.contract_id)
  if (error) return json({ error: error.message }, 500)

  return json({ token, path: `/sign/${token}` })
})

post('sign-contract', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.contract_id || !body?.signature || !body?.signer_name) {
    return json({ error: 'contract_id, signature (base64 PNG), signer_name required' }, 400)
  }
  const { admin, agencyId } = ctx

  const { data: c } = await admin
    .from('contracts')
    .select('id, signed_at')
    .eq('id', body.contract_id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!c) return json({ error: 'Contract not found' }, 404)
  if ((c as any).signed_at) return json({ error: 'Already signed' }, 409)

  // Decode base64 PNG
  const b64 = body.signature.includes(',') ? body.signature.split(',')[1] : body.signature
  const buffer = Buffer.from(b64, 'base64')
  if (buffer.length < 200) return json({ error: 'Signature vide' }, 400)

  const key = `agencies/${agencyId}/signatures/${(c as any).id}.png`
  await putObject(key, buffer, 'image/png', docsBucket())

  const { error } = await admin
    .from('contracts')
    .update({
      signature_key: key,
      signer_name: body.signer_name,
      signer_agreed: true,
      signed_at: new Date().toISOString(),
      sign_token: null,
      sign_token_expires: null,
    })
    .eq('id', (c as any).id)
  if (error) return json({ error: error.message }, 500)

  // Notify
  const { data: signed } = await admin
    .from('contracts')
    .select('reservations(date_start, date_end, vehicles(plate, brand, model), clients(full_name, phone))')
    .eq('id', (c as any).id)
    .maybeSingle()
  const res = (signed as any)?.reservations
  await enqueueNotification(agencyId, 'contract_signed', {
    contract_id: (c as any).id,
    vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate,
    plate: res?.vehicles?.plate,
    client: res?.clients?.full_name,
    client_phone: res?.clients?.phone,
    date_start: res?.date_start,
    date_end: res?.date_end,
    signed_by: body.signer_name,
  })

  // Regenerate PDF with signature baked in
  try {
    const { renderContractPdf, buildSignedPdfData } = await import('~/server/pdf.server')
    const pdfData = await buildSignedPdfData((c as any).id)
    if (pdfData) {
      const buf = await renderContractPdf(pdfData)
      const pdfKey = `agencies/${agencyId}/contracts/${(c as any).id}.pdf`
      await putObject(pdfKey, buf, 'application/pdf', docsBucket(), `attachment; filename="contrat-${String((c as any).id).slice(0, 8)}.pdf"`)
      await admin.from('contracts').update({ pdf_key: pdfKey }).eq('id', (c as any).id)
    }
  } catch (e) {
    console.error('[mobile-api/sign] PDF regen failed', e)
  }

  return json({ ok: true })
})

// ── Vehicles ────────────────────────────────────────────────────────────────

post('create-vehicle', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.plate) return json({ error: 'plate required' }, 400)
  const { admin, agencyId } = ctx
  const dailyRate = Number(body.daily_rate)
  const mileage = Number(body.mileage_current ?? 0)
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) return json({ error: 'daily_rate must be positive' }, 400)
  if (!Number.isFinite(mileage) || mileage < 0) return json({ error: 'mileage_current must be non-negative' }, 400)

  const payload = {
    agency_id: agencyId,
    plate: String(body.plate).trim().toUpperCase(),
    brand: body.brand ?? null,
    model: body.model ?? null,
    year: body.year ?? null,
    category: body.category ?? null,
    daily_rate: dailyRate,
    mileage_current: mileage,
    insurance_expiry: body.insurance_expiry ?? null,
    vignette_expiry: body.vignette_expiry ?? null,
    visite_tech_expiry: body.visite_tech_expiry ?? null,
    oil_change_last_km: body.oil_change_last_km ?? null,
    oil_change_last_date: body.oil_change_last_date ?? null,
    oil_change_interval_km: body.oil_change_interval_km ?? 10_000,
    next_service_note: body.next_service_note ?? null,
    notes: body.notes ?? null,
    image_keys: Array.isArray(body.image_keys) ? body.image_keys : [],
    document_expiries: body.document_expiries ?? {},
  }

  const { data: row, error } = await admin.from('vehicles').insert(payload).select('id').single()
  if (error) return json({ error: error.message }, 500)

  scheduleNotify(() => notifyVehicle(agencyId, (row as any).id, true))
  await enqueueVehicleNotification(agencyId, (row as any).id)
  return json({ id: (row as any).id })
})

post('update-vehicle', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.id) return json({ error: 'id required' }, 400)
  const { admin, agencyId } = ctx
  const dailyRate = Number(body.daily_rate)
  const mileage = body.mileage_current == null ? null : Number(body.mileage_current)
  if (!body.plate || !Number.isFinite(dailyRate) || dailyRate <= 0) {
    return json({ error: 'plate and positive daily_rate required' }, 400)
  }
  if (mileage != null && (!Number.isFinite(mileage) || mileage < 0)) {
    return json({ error: 'mileage_current must be non-negative' }, 400)
  }

  // Status remains database-derived. Mileage is applied separately through the
  // forward-only helper so an old reading can never roll the odometer back.
  const payload = {
    plate: body.plate != null ? String(body.plate).trim().toUpperCase() : undefined,
    brand: body.brand ?? null,
    model: body.model ?? null,
    year: body.year ?? null,
    category: body.category ?? null,
    daily_rate: dailyRate,
    insurance_expiry: body.insurance_expiry ?? null,
    vignette_expiry: body.vignette_expiry ?? null,
    visite_tech_expiry: body.visite_tech_expiry ?? null,
    oil_change_last_km: body.oil_change_last_km ?? null,
    oil_change_last_date: body.oil_change_last_date ?? null,
    oil_change_interval_km: body.oil_change_interval_km ?? 10_000,
    next_service_note: body.next_service_note ?? null,
    notes: body.notes ?? null,
    image_keys: Array.isArray(body.image_keys) ? body.image_keys : [],
    document_expiries: body.document_expiries ?? {},
  }

  const { error } = await admin.from('vehicles').update(payload).eq('id', body.id).eq('agency_id', agencyId)
  if (error) return json({ error: error.message }, 500)
  await advanceVehicleMileage(admin, body.id, mileage)
  return json({ ok: true })
})

post('release-vehicle', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.id) return json({ error: 'id required' }, 400)
  const { admin, agencyId } = ctx

  const [{ data: vehicle }, { data: issues, error: issuesError }] = await Promise.all([
    admin.from('vehicles').select('id, status').eq('id', body.id).eq('agency_id', agencyId).maybeSingle(),
    admin.from('vehicle_issues').select('blocks_rental, severity, kind, status').eq('vehicle_id', body.id),
  ])
  if (!vehicle) return json({ error: 'Vehicle not found in this agency' }, 404)
  if (issuesError) return json({ error: issuesError.message }, 500)
  const blockers = (issues ?? []).filter((issue: any) =>
    issue.status !== 'resolved' &&
    (issue.blocks_rental || issue.severity === 'critical' || ['accident', 'garage'].includes(issue.kind)),
  )
  if (blockers.length > 0) return json({ error: 'Resolve blocking vehicle issues first' }, 409)

  const { error } = await admin.from('vehicles').update({ status: 'available' }).eq('id', body.id).eq('agency_id', agencyId)
  if (error) return json({ error: error.message }, 500)
  await syncVehicleStatus(admin, body.id)
  return json({ ok: true })
})

post('presign-vehicle-uploads', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.files?.length) return json({ error: 'files array required' }, 400)
  if (!Array.isArray(body.files) || body.files.length > 8) return json({ error: 'maximum 8 files per request' }, 400)
  const { agencyId } = ctx

  const out: { key: string; url: string }[] = []
  for (const f of body.files) {
    const type = typeof f?.type === 'string' && f.type.startsWith('image/') ? f.type : null
    const size = Number(f?.size)
    if (!type || !Number.isFinite(size) || size <= 0 || size > 10_000_000) {
      return json({ error: 'every file must be an image no larger than 10 MB' }, 400)
    }
    const safe = (f.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
    const key = `agencies/${agencyId}/vehicles/photos/${crypto.randomUUID()}-${safe}`
    out.push({ key, url: await presignUpload(key, type, 300, size) })
  }
  return json(out)
})

post('presign-brand-upload', async (ctx, request) => {
  const body = await parseJsonBody(request)
  const asset = body?.asset === 'stamp' ? 'stamp' : body?.asset === 'logo' ? 'logo' : null
  const size = Number(body?.size)
  const type = typeof body?.type === 'string' && body.type.startsWith('image/') ? body.type : null
  if (!asset || !type || !Number.isFinite(size) || size <= 0 || size > 10_000_000) {
    return json({ error: 'asset, image type and size (max 10 MB) required' }, 400)
  }
  const safe = String(body?.name || `${asset}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
  const key = `agencies/${ctx.agencyId}/brand/${asset}-${crypto.randomUUID()}-${safe}`
  return json({
    key,
    url: await presignUpload(key, type, 300, size),
    public_url: publicUrl(key),
  })
})

post('presign-signature-upload', async (ctx) => {
  const { agencyId } = ctx
  const key = `agencies/${agencyId}/signatures/${crypto.randomUUID()}.png`
  const url = await presignUpload(key, 'image/png', 300, 2_000_000)
  return json({ key, url })
})

// ── Service / Maintenance ───────────────────────────────────────────────────

post('log-service', async (ctx, request) => {
  const body = await parseJsonBody(request)
  if (!body?.vehicle_id || !body?.type || !body?.performed_at) {
    return json({ error: 'vehicle_id, type, performed_at required' }, 400)
  }
  const { admin, agencyId, memberId } = ctx

  const { data: vehicle } = await admin
    .from('vehicles')
    .select('id')
    .eq('id', body.vehicle_id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!vehicle) return json({ error: 'Vehicle not found in this agency' }, 404)

  const { data: plans } = await admin.from('service_plans').select('*').eq('agency_id', agencyId)
  const plan = resolvePlan(body.type, body.vehicle_id, (plans ?? []) as unknown as PlanRow[])

  const nextDueKm = body.odometer_km != null && plan.interval_km != null
    ? body.odometer_km + plan.interval_km : null
  const nextDueDate = plan.interval_months != null
    ? format(addMonths(new Date(`${body.performed_at}T00:00:00`), plan.interval_months), 'yyyy-MM-dd') : null

  const { error } = await admin.from('service_records').insert({
    agency_id: agencyId,
    vehicle_id: body.vehicle_id,
    type: body.type,
    performed_at: body.performed_at,
    odometer_km: body.odometer_km ?? null,
    cost: body.cost ?? null,
    garage: body.garage ?? null,
    notes: body.notes ?? null,
    next_due_km: nextDueKm,
    next_due_date: nextDueDate,
    created_by: memberId,
  })
  if (error) return json({ error: error.message }, 500)

  await advanceVehicleMileage(admin, body.vehicle_id, body.odometer_km ?? null)

  if (body.type === 'vidange' && body.odometer_km != null) {
    await admin.from('vehicles')
      .update({ oil_change_last_km: body.odometer_km, oil_change_last_date: body.performed_at })
      .eq('id', body.vehicle_id)
  }

  await enqueueNotification(agencyId, 'service_record_created', {
    vehicle_id: body.vehicle_id,
    type: body.type,
    performed_at: body.performed_at,
    odometer_km: body.odometer_km,
    cost: body.cost,
  })
  return json({ ok: true })
})

// ── Compliance ──────────────────────────────────────────────────────────────

get('check-compliance', async (ctx, request) => {
  const url = new URL(request.url)
  const vehicleId = url.searchParams.get('vehicle_id')
  const dateEnd = url.searchParams.get('date_end')
  if (!vehicleId || !dateEnd) return json({ error: 'vehicle_id, date_end query params required' }, 400)
  const { admin, agencyId } = ctx
  const today = agencyToday()

  const [{ data: v }, { data: docTypes }, { data: lastVidange }, { data: planRows }] = await Promise.all([
    admin.from('vehicles').select('insurance_expiry, vignette_expiry, visite_tech_expiry, mileage_current, document_expiries')
      .eq('id', vehicleId).eq('agency_id', agencyId).maybeSingle(),
    admin.from('document_types').select('name, code').eq('agency_id', agencyId),
    admin.from('service_records').select('odometer_km').eq('vehicle_id', vehicleId).eq('type', 'vidange')
      .order('performed_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('service_plans').select('*').eq('agency_id', agencyId),
  ])
  if (!v) return json([])
  const veh = v as any
  const issues: any[] = []

  const check = (code: string, label: string | null, date: string | null | undefined) => {
    if (!date) return
    if (date < today) issues.push({ code, label, severity: 'expired', date })
    else if (date < dateEnd) issues.push({ code, label, severity: 'lapses', date })
  }
  check('insurance', null, veh.insurance_expiry)
  check('vignette', null, veh.vignette_expiry)
  check('visite', null, veh.visite_tech_expiry)

  const exp = veh.document_expiries ?? {}
  for (const dt of (docTypes ?? []) as any[]) check(dt.code, dt.name, exp[dt.code])

  const plan = resolvePlan('vidange', vehicleId, (planRows ?? []) as unknown as PlanRow[])
  const lastKm = (lastVidange as any)?.odometer_km ?? null
  if (lastKm != null && plan.interval_km != null) {
    const kmLeft = lastKm + plan.interval_km - (veh.mileage_current ?? 0)
    if (kmLeft <= 0) issues.push({ code: 'oil', label: null, severity: 'expired', date: null })
    else if (kmLeft <= plan.soon_km) issues.push({ code: 'oil', label: null, severity: 'due', date: null })
  }
  return json(issues)
})

// ── Dashboard ───────────────────────────────────────────────────────────────

get('dashboard', async (ctx) => {
  const { admin, agencyId } = ctx
  const now = new Date()
  const todayStr = agencyToday()
  const moS = format(startOfMonth(now), 'yyyy-MM-dd')
  const moE = format(endOfMonth(now), 'yyyy-MM-dd')
  const wkS = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const wkE = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const { data } = await admin
    .from('reservations')
    .select('date_start, date_end, status, total_amount, vehicle_id, vehicles(plate, brand, model, image_keys)')
    .eq('agency_id', agencyId)
    .neq('status', 'cancelled')
    .neq('status', 'blocked')

  let returnsToday = 0
  let pickupsToday = 0
  let revToday = 0
  let revWeek = 0
  let revMonth = 0
  let revTotal = 0
  const perVehicle = new Map<string, any>()
  const upcoming: any[] = []
  const overdue: any[] = []

  for (const r of (data ?? []) as any[]) {
    const amt = r.total_amount ?? 0
    const live = r.status === 'confirmed' || r.status === 'active'
    if (live && r.date_end === todayStr) returnsToday++
    if (live && r.date_start === todayStr) pickupsToday++

    const counts = r.status !== 'pending'
    if (counts) {
      revTotal += amt
      if (r.date_start === todayStr) revToday += amt
      if (r.date_start >= wkS && r.date_start <= wkE) revWeek += amt
      if (r.date_start >= moS && r.date_start <= moE) revMonth += amt

      if (r.vehicle_id) {
        const v = perVehicle.get(r.vehicle_id) ?? {
          vehicle_id: r.vehicle_id,
          plate: r.vehicles?.plate ?? '—',
          name: [r.vehicles?.brand, r.vehicles?.model].filter(Boolean).join(' ') || r.vehicles?.plate || '—',
          image_key: (r.vehicles?.image_keys ?? [])[0] ?? null,
          total: 0, count: 0,
        }
        v.total += amt
        v.count += 1
        perVehicle.set(r.vehicle_id, v)
      }
    }

    if (live && r.date_end >= todayStr) upcoming.push({
      id: r.id ?? '', date_start: r.date_start, date_end: r.date_end, status: r.status,
    })
    if (live && r.date_end < todayStr) overdue.push({
      id: r.id ?? '', date_start: r.date_start, date_end: r.date_end, status: r.status,
    })
  }

  // Fleet count
  const { count: fleetTotal } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId)
  const { count: fleetRented } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).eq('status', 'rented')
  const { count: clientCount } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId)

  return json({
    returnsToday, pickupsToday,
    revToday, revWeek, revMonth, revTotal,
    perVehicle: [...perVehicle.values()].sort((a: any, b: any) => b.total - a.total),
    upcoming: upcoming.sort((a, b) => a.date_end.localeCompare(b.date_end)).slice(0, 8),
    overdue,
    fleetTotal: fleetTotal ?? 0,
    fleetRented: fleetRented ?? 0,
    clientCount: clientCount ?? 0,
  })
})

// ── Blacklist check ─────────────────────────────────────────────────────────

get('check-blacklist', async (ctx, request) => {
  const url = new URL(request.url)
  const cin = url.searchParams.get('cin')
  if (!cin) return json({ error: 'cin query param required' }, 400)
  const { admin, agencyId } = ctx

  const { data: rows } = await admin
    .from('clients')
    .select('id, full_name, cin_passport, phone, status, blacklist_reason, blacklist_date')
    .eq('agency_id', agencyId)
    .eq('cin_passport', cin.trim())
    .in('status', ['flagged', 'blacklisted'])
  return json(rows ?? [])
})

// ── Route handler ───────────────────────────────────────────────────────────

export const Route = createFileRoute('/mobile-api/$action')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const action = params.action
        const h = handlers[action]
        if (!h) return json({ error: `Unknown action: ${action}` }, 404)
        if (h.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
        const ctx = await requireMobileAuth(request)
        if (ctx instanceof Response) return ctx
        try {
          return await h.handler(ctx, request)
        } catch (e: any) {
          console.error(`[mobile-api/${action}] error`, e)
          return json({ error: e.message || 'Internal error' }, 500)
        }
      },
      POST: async ({ request, params }) => {
        const action = params.action
        const h = handlers[action]
        if (!h) return json({ error: `Unknown action: ${action}` }, 404)
        if (h.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
        const ctx = await requireMobileAuth(request)
        if (ctx instanceof Response) return ctx
        try {
          return await h.handler(ctx, request)
        } catch (e: any) {
          console.error(`[mobile-api/${action}] error`, e)
          return json({ error: e.message || 'Internal error' }, 500)
        }
      },
    },
  },
})
