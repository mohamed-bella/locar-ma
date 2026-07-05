import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { reservationSchema, blockSchema, RESERVATION_STATUSES } from '~/lib/schemas'
import { publicUrl } from '~/lib/r2.server'
import { syncVehicleStatus } from './vehicleStatus'

export type Reservation = {
  id: string
  vehicle_id: string
  client_id: string | null
  client_name: string | null
  date_start: string
  date_end: string
  status: string
  total_amount: number | null
  daily_rate_snap: number | null
  pickup_location: string | null
  dropoff_location: string | null
  notes: string | null
  is_block: boolean
}

const OVERLAP_MESSAGE = 'Those dates overlap an existing booking for this vehicle.'

// Postgres exclusion-constraint violation → friendly message.
function rethrow(error: { code?: string; message: string } | null): never {
  if (error?.code === '23P01') throw new Error(OVERLAP_MESSAGE)
  throw new Error(error?.message ?? 'Something went wrong')
}

function daysBetween(start: string, end: string) {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}

function mapRow(r: any): Reservation {
  return {
    id: r.id,
    vehicle_id: r.vehicle_id,
    client_id: r.client_id ?? null,
    client_name: r.clients?.full_name ?? null,
    date_start: r.date_start,
    date_end: r.date_end,
    status: r.status,
    total_amount: r.total_amount ?? null,
    daily_rate_snap: r.daily_rate_snap ?? null,
    pickup_location: r.pickup_location ?? null,
    dropoff_location: r.dropoff_location ?? null,
    notes: r.notes ?? null,
    is_block: r.status === 'blocked',
  }
}

// Reservations overlapping the [from, to] window.
export const listReservations = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<Reservation[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('reservations')
      .select('*, clients(full_name)')
      .lte('date_start', data.to)
      .gte('date_end', data.from)
      .neq('status', 'cancelled')
      .order('date_start')
    if (error) throw new Error(error.message)
    return (rows ?? []).map(mapRow)
  })

export type AvailabilityRow = {
  vehicle: {
    id: string
    plate: string
    brand: string | null
    brand_logo_url: string | null
    image_url: string | null
    daily_rate: number
    status: string
  }
  available: boolean
  conflicts: Reservation[]
}

// For a date range, which vehicles are free vs busy (and why).
export const checkAvailability = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ data }): Promise<AvailabilityRow[]> => {
    const { supabase } = await requireAgencyContext()
    const [{ data: vehicles, error: vErr }, { data: res, error: rErr }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, plate, brand, daily_rate, status, image_keys, brands(name, logo_key)')
        .order('plate'),
      supabase
        .from('reservations')
        .select('*, clients(full_name)')
        .lte('date_start', data.to)
        .gte('date_end', data.from)
        .neq('status', 'cancelled'),
    ])
    if (vErr) throw new Error(vErr.message)
    if (rErr) throw new Error(rErr.message)

    const byVehicle = new Map<string, Reservation[]>()
    for (const r of res ?? []) {
      const m = mapRow(r)
      const list = byVehicle.get(m.vehicle_id) ?? []
      list.push(m)
      byVehicle.set(m.vehicle_id, list)
    }

    return (vehicles ?? []).map((v: any) => {
      const conflicts = byVehicle.get(v.id) ?? []
      const keys: string[] = v.image_keys ?? []
      return {
        vehicle: {
          id: v.id,
          plate: v.plate,
          brand: v.brand ?? v.brands?.name ?? null,
          brand_logo_url: v.brands?.logo_key ? publicUrl(v.brands.logo_key) : null,
          image_url: keys[0] ? publicUrl(keys[0]) : null,
          daily_rate: v.daily_rate,
          status: v.status,
        },
        available: conflicts.length === 0,
        conflicts,
      }
    })
  })

export type FleetStatusRow = {
  id: string
  plate: string
  brand: string | null
  image_url: string | null
  status: string
  current: { date_end: string; client_name: string | null } | null
  next: { date_start: string; client_name: string | null } | null
}

// Live per-vehicle status board: what each car is doing right now (rented and
// when it comes back) plus its next upcoming booking.
export const getFleetStatusBoard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FleetStatusRow[]> => {
    const { supabase } = await requireAgencyContext()
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: vehicles, error: vErr }, { data: res, error: rErr }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id, plate, brand, status, image_keys, brands(name)')
        .order('plate'),
      supabase
        .from('reservations')
        .select('vehicle_id, date_start, date_end, status, clients(full_name)')
        .neq('status', 'cancelled')
        .gte('date_end', today)
        .order('date_start'),
    ])
    if (vErr) throw new Error(vErr.message)
    if (rErr) throw new Error(rErr.message)

    const byVehicle = new Map<string, any[]>()
    for (const r of (res ?? []) as any[]) {
      const list = byVehicle.get(r.vehicle_id) ?? []
      list.push(r)
      byVehicle.set(r.vehicle_id, list)
    }

    return (vehicles ?? []).map((v: any) => {
      const list = byVehicle.get(v.id) ?? []
      const current = list.find((r) => r.date_start <= today && r.date_end >= today) ?? null
      const next = list.find((r) => r.date_start > today) ?? null
      const keys: string[] = v.image_keys ?? []
      return {
        id: v.id,
        plate: v.plate,
        brand: v.brand ?? v.brands?.name ?? null,
        image_url: keys[0] ? publicUrl(keys[0]) : null,
        status: v.status,
        current: current
          ? { date_end: current.date_end, client_name: current.clients?.full_name ?? null }
          : null,
        next: next ? { date_start: next.date_start, client_name: next.clients?.full_name ?? null } : null,
      }
    })
  },
)

// ── Compliance guard ───────────────────────────────────
// Before a booking is created, verify the vehicle stays legal & serviced for
// the WHOLE rental window — a paper that lapses while the car is still out is a
// real liability. Returns the issues so the UI can warn (owner may override).
export type ComplianceIssue = {
  code: string // 'insurance' | 'vignette' | 'visite' | 'oil' | <custom doc code>
  label: string | null // custom doc name; null for built-ins (UI localizes)
  severity: 'expired' | 'lapses' | 'due'
  date: string | null
}

export const checkVehicleCompliance = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z.object({ vehicle_id: z.string().uuid(), date_end: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<ComplianceIssue[]> => {
    const { supabase } = await requireAgencyContext()
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: v }, { data: docTypes }] = await Promise.all([
      supabase
        .from('vehicles')
        .select(
          'insurance_expiry, vignette_expiry, visite_tech_expiry, mileage_current, oil_change_last_km, oil_change_interval_km, document_expiries',
        )
        .eq('id', data.vehicle_id)
        .maybeSingle(),
      supabase.from('document_types').select('name, code'),
    ])
    if (!v) return []
    const veh = v as any
    const issues: ComplianceIssue[] = []

    const check = (code: string, label: string | null, date: string | null | undefined) => {
      if (!date) return
      if (date < today) issues.push({ code, label, severity: 'expired', date })
      else if (date < data.date_end) issues.push({ code, label, severity: 'lapses', date })
    }

    check('insurance', null, veh.insurance_expiry)
    check('vignette', null, veh.vignette_expiry)
    check('visite', null, veh.visite_tech_expiry)

    const exp = veh.document_expiries ?? {}
    for (const dt of (docTypes ?? []) as any[]) check(dt.code, dt.name, exp[dt.code])

    // Oil change (mileage-based): flag overdue / imminent at booking time.
    const interval = veh.oil_change_interval_km || 10000
    if (veh.oil_change_last_km != null) {
      const kmLeft = veh.oil_change_last_km + interval - (veh.mileage_current ?? 0)
      if (kmLeft <= 0) issues.push({ code: 'oil', label: null, severity: 'expired', date: null })
      else if (kmLeft <= 1000) issues.push({ code: 'oil', label: null, severity: 'due', date: null })
    }

    return issues
  })

// All reservations for one vehicle (any status), with contract linkage. Powers
// the car-detail history section and the delete-impact modal.
export type VehicleReservation = {
  id: string
  date_start: string
  date_end: string
  status: string
  is_block: boolean
  client_name: string | null
  total_amount: number | null
  contract_id: string | null
  has_pdf: boolean
}

export const listVehicleReservations = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<VehicleReservation[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('reservations')
      .select('id, date_start, date_end, status, total_amount, clients(full_name), contracts(id, pdf_key)')
      .eq('vehicle_id', data.vehicle_id)
      .order('date_start', { ascending: false })
    if (error) throw new Error(error.message)
    return (rows ?? []).map((r: any) => {
      const c = Array.isArray(r.contracts) ? r.contracts[0] : r.contracts
      return {
        id: r.id,
        date_start: r.date_start,
        date_end: r.date_end,
        status: r.status,
        is_block: r.status === 'blocked',
        client_name: r.clients?.full_name ?? null,
        total_amount: r.total_amount ?? null,
        contract_id: c?.id ?? null,
        has_pdf: !!c?.pdf_key,
      }
    })
  })

export const createReservation = createServerFn({ method: 'POST' })
  .validator((d: unknown) => reservationSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()

    let rate = data.daily_rate_snap
    if (rate == null) {
      const { data: v } = await supabase
        .from('vehicles')
        .select('daily_rate')
        .eq('id', data.vehicle_id)
        .maybeSingle()
      rate = (v as any)?.daily_rate ?? 0
    }
    const total =
      data.total_amount ?? Number(rate) * daysBetween(data.date_start, data.date_end)

    const { data: row, error } = await supabase
      .from('reservations')
      .insert({
        agency_id: agencyId,
        vehicle_id: data.vehicle_id,
        client_id: data.client_id ?? null,
        date_start: data.date_start,
        date_end: data.date_end,
        pickup_location: data.pickup_location ?? null,
        dropoff_location: data.dropoff_location ?? null,
        status: data.status,
        daily_rate_snap: rate,
        total_amount: total,
        notes: data.notes ?? null,
        created_by: memberId,
      })
      .select('id')
      .single()
    if (error) rethrow(error as any)
    // Booking created → reflect it on the car (reserved / rented).
    await syncVehicleStatus(supabase, data.vehicle_id)
    return { id: (row as any).id as string }
  })

export const updateReservation = createServerFn({ method: 'POST' })
  .validator((d: unknown) => reservationSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { id, ...rest } = data
    // Capture the previous vehicle so a reassignment frees the old car too.
    const { data: prev } = await supabase
      .from('reservations')
      .select('vehicle_id')
      .eq('id', id)
      .maybeSingle()
    const total =
      rest.total_amount ??
      (rest.daily_rate_snap != null
        ? Number(rest.daily_rate_snap) * daysBetween(rest.date_start, rest.date_end)
        : undefined)
    const { error } = await supabase
      .from('reservations')
      .update({
        vehicle_id: rest.vehicle_id,
        client_id: rest.client_id ?? null,
        date_start: rest.date_start,
        date_end: rest.date_end,
        pickup_location: rest.pickup_location ?? null,
        dropoff_location: rest.dropoff_location ?? null,
        status: rest.status,
        daily_rate_snap: rest.daily_rate_snap ?? null,
        ...(total != null ? { total_amount: total } : {}),
        notes: rest.notes ?? null,
      })
      .eq('id', id)
    if (error) rethrow(error as any)
    const oldVehicle = (prev as any)?.vehicle_id
    if (oldVehicle && oldVehicle !== rest.vehicle_id) await syncVehicleStatus(supabase, oldVehicle)
    await syncVehicleStatus(supabase, rest.vehicle_id)
    return { ok: true }
  })

export const setReservationStatus = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(RESERVATION_STATUSES) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('reservations')
      .update({ status: data.status })
      .eq('id', data.id)
      .select('vehicle_id')
      .maybeSingle()
    if (error) rethrow(error as any)
    await syncVehicleStatus(supabase, (row as any)?.vehicle_id)
    return { ok: true }
  })

export const deleteReservation = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { data: prev } = await supabase
      .from('reservations')
      .select('vehicle_id')
      .eq('id', data.id)
      .maybeSingle()
    const { error } = await supabase.from('reservations').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    await syncVehicleStatus(supabase, (prev as any)?.vehicle_id)
    return { ok: true }
  })

// Manual block (maintenance / hold). Stored as a reservation with status 'blocked'.
export const createBlock = createServerFn({ method: 'POST' })
  .validator((d: unknown) => blockSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()
    const { error } = await supabase.from('reservations').insert({
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      date_start: data.date_start,
      date_end: data.date_end,
      status: 'blocked',
      total_amount: 0,
      notes: data.reason ?? 'Blocked',
      created_by: memberId,
    })
    if (error) rethrow(error as any)
    await syncVehicleStatus(supabase, data.vehicle_id)
    return { ok: true }
  })
