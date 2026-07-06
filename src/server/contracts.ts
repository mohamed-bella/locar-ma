import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { contractUpdateSchema } from '~/lib/schemas'
import { publicUrl, putObject, presignDownload } from '~/lib/r2.server'
import { syncVehicleStatus } from './vehicleStatus'
import { notifyNewContract, scheduleNotify } from '~/lib/email.server'

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
  pdf_key: string | null
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
  agency: { name: string; city: string | null }
}

const short = (id: string) => id.slice(0, 8).toUpperCase()

const DETAIL_SELECT =
  '*, agencies(name, city), reservations(date_start, date_end, status, total_amount, daily_rate_snap, pickup_location, dropoff_location, vehicles(id, plate, brand, model, year), clients(id, full_name, cin_passport, phone, address, nationality))'

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
    pdf_key: r.pdf_key ?? null,
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
    agency: r.agencies ?? { name: 'Agency', city: null },
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
    return row ? mapDetail(row) : null
  })

// "Start rental" — create a contract from a reservation, mark it active.
export const createContractFromReservation = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ reservation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
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
    return { id: (row as any).id as string }
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
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
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
    // runs on a live mileage — the whole point of the maintenance redesign.
    if (vehicleId && data.mileage_in != null) {
      const { data: v } = await supabase.from('vehicles').select('mileage_current').eq('id', vehicleId).maybeSingle()
      if ((v as any)?.mileage_current == null || data.mileage_in > (v as any).mileage_current) {
        await supabase.from('vehicles').update({ mileage_current: data.mileage_in }).eq('id', vehicleId)
      }
    }

    // Recompute status from remaining bookings (may become reserved, not just available).
    if (vehicleId) await syncVehicleStatus(supabase, vehicleId)
    return { ok: true }
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
    const buffer = await renderContractPdf({
      agency: c.agency,
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
      reservation: c.reservation,
      vehicle: c.vehicle,
      client: c.client ?? {
        full_name: 'Client',
        cin_passport: null,
        phone: null,
        address: null,
        nationality: null,
      },
    })

    const key = `agencies/${agencyId}/contracts/${c.id}.pdf`
    // NOTE: contracts currently stored in the public R2_BUCKET (locar), not the
    // private docs bucket. Revert to docsBucket() to move them back.
    await putObject(key, buffer, 'application/pdf')
    await supabase.from('contracts').update({ pdf_key: key }).eq('id', c.id)
    // Short-lived signed link so the just-generated PDF opens immediately.
    return { key, url: await presignDownload(key, 3600) }
  })

// On-demand signed URL for an existing contract PDF. RLS scopes the lookup to
// the caller's agency; the private bucket is never publicly reachable. A 7-day
// expiry is used so a link shared over WhatsApp stays valid for the rental.
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
    return { url: await presignDownload(key, 60 * 60 * 24 * 7) }
  })
