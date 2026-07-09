import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { contractUpdateSchema } from '~/lib/schemas'
import { publicUrl, putObject, presignDownload, docsBucket } from '~/lib/r2.server'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { syncVehicleStatus } from './vehicleStatus'
import { advanceVehicleMileage } from './mileage'
import { notifyNewContract, scheduleNotify } from '~/lib/email.server'
import { enqueueContractNotification, enqueuePdfNotification } from './notifications'
import * as Sentry from '@sentry/tanstackstart-react'

export type Extra = { name: string; price: number }

export type ContractSummary = {
  id: string
  short_id: string
  status: string
  date_start: string | null
  date_end: string | null
  total_amount: number | null
  vehicle_plate: string | null
  client_name: string | null
  has_pdf: boolean
  created_at: string
}

export type ContractDetail = {
  id: string
  short_id: string
  reservation_id: string | null
  mileage_out: number | null
  mileage_in: number | null
  fuel_out: string | null
  fuel_in: string | null
  check_number: string | null
  check_bank: string | null
  check_amount: number | null
  check_status: string
  extras: Extra[]
  form: Record<string, string>
  signature_key: string | null
  signed_at: string | null
  signer_name: string | null
  pdf_key: string | null
  pdf_url: string | null // permanent public URL (contracts live in the public bucket)
  has_pdf: boolean
  closed_at: string | null
  created_at: string
  reservation: {
    date_start: string
    date_end: string
    status: string
    total_amount: number | null
    daily_rate_snap: number | null
    pickup_location: string | null
    dropoff_location: string | null
  } | null
  vehicle: { id: string; plate: string; brand: string | null; model: string | null; year: number | null } | null
  client: {
    id: string
    full_name: string
    cin_passport: string | null
    phone: string | null
    address: string | null
    nationality: string | null
  } | null
  agency: {
    name: string
    city: string | null
    logo_url: string | null
    stamp_url: string | null
    legal_name: string | null
    address: string | null
    ice: string | null
    rc: string | null
    patente: string | null
    rib: string | null
    company_phone: string | null
  }
}

const short = (id: string) => id.slice(0, 8).toUpperCase()

const DETAIL_SELECT =
  '*, agencies(name, city, logo_url, stamp_url, legal_name, address, ice, rc, patente, rib, company_phone), reservations(date_start, date_end, status, total_amount, daily_rate_snap, pickup_location, dropoff_location, vehicles(id, plate, brand, model, year), clients(id, full_name, cin_passport, phone, address, nationality))'

function mapDetail(r: any): ContractDetail {
  const res = r.reservations ?? null
  return {
    id: r.id,
    short_id: short(r.id),
    reservation_id: r.reservation_id ?? null,
    mileage_out: r.mileage_out ?? null,
    mileage_in: r.mileage_in ?? null,
    fuel_out: r.fuel_out ?? null,
    fuel_in: r.fuel_in ?? null,
    check_number: r.check_number ?? null,
    check_bank: r.check_bank ?? null,
    check_amount: r.check_amount ?? null,
    check_status: r.check_status ?? 'held',
    extras: (r.extras ?? []) as Extra[],
    form: (r.form ?? {}) as Record<string, string>,
    signature_key: r.signature_key ?? null,
    signed_at: r.signed_at ?? null,
    signer_name: r.signer_name ?? null,
    pdf_key: r.pdf_key ?? null,
    // Presigned per-request in getContract (contracts hold PII → private bucket,
    // never a public URL). Null here.
    pdf_url: null,
    has_pdf: !!r.pdf_key,
    closed_at: r.closed_at ?? null,
    created_at: r.created_at,
    reservation: res
      ? {
          date_start: res.date_start,
          date_end: res.date_end,
          status: res.status,
          total_amount: res.total_amount ?? null,
          daily_rate_snap: res.daily_rate_snap ?? null,
          pickup_location: res.pickup_location ?? null,
          dropoff_location: res.dropoff_location ?? null,
        }
      : null,
    vehicle: res?.vehicles ?? null,
    client: res?.clients ?? null,
    agency: r.agencies
      ? {
          name: r.agencies.name,
          city: r.agencies.city ?? null,
          logo_url: r.agencies.logo_url ?? null,
          stamp_url: r.agencies.stamp_url ?? null,
          legal_name: r.agencies.legal_name ?? null,
          address: r.agencies.address ?? null,
          ice: r.agencies.ice ?? null,
          rc: r.agencies.rc ?? null,
          patente: r.agencies.patente ?? null,
          rib: r.agencies.rib ?? null,
          company_phone: r.agencies.company_phone ?? null,
        }
      : {
          name: 'Agency',
          city: null,
          logo_url: null,
          stamp_url: null,
          legal_name: null,
          address: null,
          ice: null,
          rc: null,
          patente: null,
          rib: null,
          company_phone: null,
        },
  }
}

export const listContracts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ContractSummary[]> => {
    const { supabase } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, pdf_key, created_at, reservations(date_start, date_end, total_amount, status, vehicles(plate), clients(full_name))',
      )
      .order('created_at', { ascending: false })
      .limit(1000) // safety ceiling; true paging is a follow-up
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({
      id: r.id,
      short_id: short(r.id),
      status: r.reservations?.status ?? '—',
      date_start: r.reservations?.date_start ?? null,
      date_end: r.reservations?.date_end ?? null,
      total_amount: r.reservations?.total_amount ?? null,
      vehicle_plate: r.reservations?.vehicles?.plate ?? null,
      client_name: r.reservations?.clients?.full_name ?? null,
      has_pdf: !!r.pdf_key,
      created_at: r.created_at,
    }))
  },
)

export type ContractableReservation = {
  id: string
  vehicle_plate: string | null
  vehicle_brand: string | null
  image_url: string | null
  client_name: string | null
  date_start: string
  date_end: string
  status: string
  total_amount: number | null
}

// Reservations that can still become a contract: not blocked/cancelled/closed
// and without an existing contract. Feeds the "New contract" picker.
export const listContractableReservations = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ContractableReservation[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: existing } = await supabase.from('contracts').select('reservation_id')
    const taken = new Set(
      (existing ?? []).map((c: any) => c.reservation_id).filter(Boolean),
    )
    const { data: rows, error } = await supabase
      .from('reservations')
      .select(
        'id, date_start, date_end, status, total_amount, clients(full_name), vehicles(plate, brand, image_keys, brands(name, logo_key))',
      )
      .in('status', ['pending', 'confirmed', 'active'])
      .order('date_start', { ascending: false })
    if (error) throw new Error(error.message)
    return (rows ?? [])
      .filter((r: any) => !taken.has(r.id))
      .map((r: any) => {
        const keys: string[] = r.vehicles?.image_keys ?? []
        return {
          id: r.id,
          vehicle_plate: r.vehicles?.plate ?? null,
          vehicle_brand: r.vehicles?.brand ?? r.vehicles?.brands?.name ?? null,
          image_url: keys[0] ? publicUrl(keys[0]) : null,
          client_name: r.clients?.full_name ?? null,
          date_start: r.date_start,
          date_end: r.date_end,
          status: r.status,
          total_amount: r.total_amount ?? null,
        }
      })
  },
)

export const getContract = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ContractDetail | null> => {
    const { supabase } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('contracts')
      .select(DETAIL_SELECT)
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) return null
    const detail = mapDetail(row)
    // Short-lived presigned link from the PRIVATE bucket (PII). Never public.
    if (detail.pdf_key) {
      detail.pdf_url = await presignDownload(detail.pdf_key, 3600, docsBucket())
    }
    return detail
  })

// "Start rental" — create a contract from a reservation, mark it active.
export const createContractFromReservation = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ reservation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ id: string | null; error?: string }> => {
   try {
    const { supabase, agencyId } = await requireAgencyContext()

    const { data: res, error: resErr } = await supabase
      .from('reservations')
      .select('id, vehicle_id, vehicles(mileage_current)')
      .eq('id', data.reservation_id)
      .maybeSingle()
    if (resErr) throw new Error(resErr.message)
    if (!res) throw new Error('Reservation not found')

    // Reuse an existing contract for this reservation if present.
    const { data: existing } = await supabase
      .from('contracts')
      .select('id')
      .eq('reservation_id', data.reservation_id)
      .maybeSingle()
    if (existing) return { id: (existing as any).id as string }

    const { data: row, error } = await supabase
      .from('contracts')
      .insert({
        agency_id: agencyId,
        reservation_id: data.reservation_id,
        mileage_out: (res as any).vehicles?.mileage_current ?? null,
        check_status: 'held',
        extras: [],
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    await supabase.from('reservations').update({ status: 'active' }).eq('id', data.reservation_id)
    // Derive the car's status from its bookings (may be reserved if the rental
    // is future-dated) rather than blindly stamping 'rented'.
    if ((res as any).vehicle_id) {
      await syncVehicleStatus(supabase, (res as any).vehicle_id)
    }
    scheduleNotify(() => notifyNewContract(agencyId, (row as any).id)) // fire-and-forget email
    scheduleNotify(() => enqueueContractNotification(agencyId, (row as any).id))
    return { id: (row as any).id as string }
   } catch (e: any) {
    // Surface the real reason to the client instead of letting the custom
    // api/server.mjs handler mangle the throw into an unparseable 500.
    console.error('createContractFromReservation failed', e)
    Sentry.captureException(e)
    return { id: null, error: String(e?.message || e) }
   }
  })

export const updateContract = createServerFn({ method: 'POST' })
  .validator((d: unknown) => contractUpdateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { id, ...rest } = data
    const { error } = await supabase
      .from('contracts')
      .update({
        mileage_out: rest.mileage_out ?? null,
        mileage_in: rest.mileage_in ?? null,
        fuel_out: rest.fuel_out ?? null,
        fuel_in: rest.fuel_in ?? null,
        check_number: rest.check_number ?? null,
        check_bank: rest.check_bank ?? null,
        check_amount: rest.check_amount ?? null,
        check_status: rest.check_status,
        extras: rest.extras,
        ...(rest.form ? { form: rest.form } : {}),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)

    // A mileage typed on the contract must reach the car too — otherwise the km
    // lives only on the contract and the vehicle's odometer goes stale. Same
    // single writer as everywhere else (forward-only).
    const reading = rest.mileage_in ?? rest.mileage_out
    if (reading != null) {
      const { data: c } = await supabase
        .from('contracts')
        .select('reservations(vehicle_id)')
        .eq('id', id)
        .maybeSingle()
      await advanceVehicleMileage(supabase, (c as any)?.reservations?.vehicle_id, reading)
    }
    return { ok: true }
  })

// "Close rental" — record return, free the vehicle.
export const closeContract = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), mileage_in: z.coerce.number().optional(), fuel_in: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { data: c } = await supabase
      .from('contracts')
      .select('reservation_id, reservations(vehicle_id)')
      .eq('id', data.id)
      .maybeSingle()

    const { error } = await supabase
      .from('contracts')
      .update({
        mileage_in: data.mileage_in ?? null,
        fuel_in: data.fuel_in ?? null,
        closed_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    if (error) throw new Error(error.message)

    const reservationId = (c as any)?.reservation_id
    const vehicleId = (c as any)?.reservations?.vehicle_id
    if (reservationId) await supabase.from('reservations').update({ status: 'closed' }).eq('id', reservationId)

    // Feed the return odometer back into the vehicle so maintenance ("suivi")
    // runs on a live mileage. Single writer (forward-only). See server/mileage.ts.
    await advanceVehicleMileage(supabase, vehicleId, data.mileage_in ?? null)

    // Recompute status from remaining bookings (may become reserved, not just available).
    if (vehicleId) await syncVehicleStatus(supabase, vehicleId)
    return { ok: true }
  })

// ContractDetail → the shape the PDF component expects. Shared by generate +
// preview so both always render identical output.
function toPdfData(c: ContractDetail) {
  return {
    agency: {
      name: c.agency.name,
      city: c.agency.city,
      logo_url: c.agency.logo_url,
      stamp_url: c.agency.stamp_url,
      legal_name: c.agency.legal_name,
      address: c.agency.address,
      ice: c.agency.ice,
      rc: c.agency.rc,
      patente: c.agency.patente,
      rib: c.agency.rib,
      phone: c.agency.company_phone, // PDF header/footer GSM line
    },
    contract: {
      short_id: c.short_id,
      mileage_out: c.mileage_out,
      mileage_in: c.mileage_in,
      fuel_out: c.fuel_out,
      fuel_in: c.fuel_in,
      check_number: c.check_number,
      check_bank: c.check_bank,
      check_amount: c.check_amount,
      extras: c.extras,
    },
    reservation: c.reservation!,
    vehicle: c.vehicle!,
    client: c.client ?? {
      full_name: 'Client',
      cin_passport: null,
      phone: null,
      address: null,
      nationality: null,
    },
    form: c.form,
    signer_name: c.signer_name,
    signed_at: c.signed_at,
    signature: null as string | null, // filled by buildPdfData (data URL)
  }
}

// react-pdf guesses image format from the URL extension — our R2 keys don't
// always end in .png/.jpg, so it rejects them ("Not valid image extension").
// Fetch the bytes and hand react-pdf a data URL (carries the real MIME type),
// which sidesteps extension detection and any CDN caching entirely.
async function fetchAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || 'image/png'
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return null // never let a missing image break the PDF
  }
}

// toPdfData + inline the logo/stamp/signature images so they always render.
async function buildPdfData(c: ContractDetail) {
  const data = toPdfData(c)
  // Signature lives in the PRIVATE bucket → presign then inline.
  const sigUrl = c.signature_key ? await presignDownload(c.signature_key, 600, docsBucket()) : null
  const [logo, stamp, signature] = await Promise.all([
    fetchAsDataUrl(data.agency.logo_url),
    fetchAsDataUrl(data.agency.stamp_url),
    fetchAsDataUrl(sigUrl),
  ])
  data.agency.logo_url = logo
  data.agency.stamp_url = stamp
  data.signature = signature
  return data
}

// Build PDF data for the PUBLIC signing flow (no agency session) — admin lookup
// by id. Used by server/signatures.ts to bake the signature into the PDF.
export async function buildSignedPdfData(contractId: string) {
  const admin = getSupabaseAdminClient()
  const { data: row } = await (admin as any).from('contracts').select(DETAIL_SELECT).eq('id', contractId).maybeSingle()
  if (!row) return null
  const c = mapDetail(row)
  if (!c.reservation || !c.vehicle) return null
  return buildPdfData(c)
}

// Preview: render the CURRENT saved state to an inline base64 data URL. Nothing
// is written to R2 — used by the preview modal (the stored PDF has an
// attachment disposition and would download instead of display in an iframe).
export const previewContractPdf = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    const { supabase } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('contracts')
      .select(DETAIL_SELECT)
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) throw new Error('Contract not found')
    const c = mapDetail(row)
    if (!c.reservation || !c.vehicle) throw new Error('Contract is missing reservation or vehicle data')

    const { renderContractPdf } = await import('./pdf.server')
    const buffer = await renderContractPdf(await buildPdfData(c))
    return { dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}` }
  })

// Render the PDF, store to R2, save the key.
export const generateContractPdf = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('contracts')
      .select(DETAIL_SELECT)
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) throw new Error('Contract not found')
    const c = mapDetail(row)
    if (!c.reservation || !c.vehicle) throw new Error('Contract is missing reservation or vehicle data')

    const { renderContractPdf } = await import('./pdf.server')
    const buffer = await renderContractPdf(await buildPdfData(c))

    const key = `agencies/${agencyId}/contracts/${c.id}.pdf`
    // Download filename = car + reservation date (ASCII-safe).
    const carName = [c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(' ') || c.vehicle?.plate || 'contrat'
    const dateStr = c.reservation?.date_start || c.created_at?.slice(0, 10) || ''
    const safe =
      `${carName} ${dateStr}`
        .normalize('NFD') // accents → base letter + combining mark…
        .replace(/[^a-zA-Z0-9]+/g, '-') // …then strip marks + spaces to hyphens
        .replace(/^-+|-+$/g, '') || 'contrat'
    const filename = `${safe}.pdf`
    // Contracts hold client PII (CIN, address, licence) → PRIVATE bucket only.
    // Served via short-lived presigned links, never a public URL.
    await putObject(key, buffer, 'application/pdf', docsBucket(), `attachment; filename="${filename}"`)
    await supabase.from('contracts').update({ pdf_key: key }).eq('id', c.id)
    const url = await presignDownload(key, 3600, docsBucket())
    scheduleNotify(() => enqueuePdfNotification(agencyId, c.id))
    return { key, url, filename }
  })

// Permanent public URL for an existing contract PDF (contracts live in the
// public bucket). Works on any device with no session — RLS still scopes the
// lookup to the caller's agency.
export const getContractPdfUrl = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabase } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('contracts')
      .select('pdf_key')
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const key = (row as any)?.pdf_key as string | null
    if (!key) throw new Error('No PDF generated yet')
    return { url: await presignDownload(key, 3600, docsBucket()) }
  })
