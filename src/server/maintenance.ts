import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { addMonths } from 'date-fns'
import { requireAgencyContext } from './context'
import { advanceVehicleMileage } from './mileage'
import { publicUrl } from '~/lib/r2.server'
import { enqueueNotification } from './notifications'
import { agencyToday } from '~/lib/tz'
import {
  DEFAULT_PLANS,
  PLANNED_TYPES,
  SERVICE_TYPES,
  computeService,
  resolvePlan,
  type PlanRow,
  type ServiceCompute,
} from '~/lib/maintenance'

export type ServicePlan = {
  id: string
  agency_id: string
  vehicle_id: string | null
  type: string
  interval_km: number | null
  interval_months: number | null
  soon_km: number
  soon_days: number
}

export type ServiceRecord = {
  id: string
  vehicle_id: string
  type: string
  performed_at: string
  odometer_km: number | null
  cost: number | null
  garage: string | null
  notes: string | null
  next_due_km: number | null
  next_due_date: string | null
  created_at: string
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── Plans ──────────────────────────────────────────────
// Fleet-default plans are seeded on first read so every agency starts with
// sane vidange/courroie/… schedules it can then tune.
export const listServicePlans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ServicePlan[]> => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data, error } = await supabase.from('service_plans').select('*')
    if (error) throw new Error(error.message)
    if (data && data.length > 0) return data as unknown as ServicePlan[]

    const defaults = PLANNED_TYPES.map((type) => ({
      agency_id: agencyId,
      vehicle_id: null,
      type,
      interval_km: DEFAULT_PLANS[type].interval_km,
      interval_months: DEFAULT_PLANS[type].interval_months,
      soon_km: DEFAULT_PLANS[type].soon_km,
      soon_days: DEFAULT_PLANS[type].soon_days,
    }))
    const { data: seeded, error: sErr } = await supabase.from('service_plans').insert(defaults).select('*')
    if (sErr) throw new Error(sErr.message)
    return (seeded ?? []) as unknown as ServicePlan[]
  },
)

export const upsertServicePlan = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        vehicle_id: z.string().uuid().nullable().default(null),
        type: z.string().min(1),
        interval_km: z.coerce.number().int().positive().nullable().default(null),
        interval_months: z.coerce.number().int().positive().nullable().default(null),
        soon_km: z.coerce.number().int().min(0).default(1000),
        soon_days: z.coerce.number().int().min(0).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const payload = {
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      type: data.type,
      interval_km: data.interval_km,
      interval_months: data.interval_months,
      soon_km: data.soon_km,
      soon_days: data.soon_days,
    }
    const q = data.id
      ? supabase.from('service_plans').update(payload).eq('id', data.id)
      : supabase.from('service_plans').insert(payload)
    const { error } = await q
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ── Records (history) ──────────────────────────────────
export const listServiceRecords = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ServiceRecord[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('service_records')
      .select('*')
      .eq('vehicle_id', data.vehicle_id)
      .order('performed_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (rows ?? []) as unknown as ServiceRecord[]
  })

const logServiceSchema = z.object({
  vehicle_id: z.string().uuid(),
  type: z.string().min(1),
  performed_at: z.string().min(1),
  odometer_km: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().min(0).optional()),
  cost: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().min(0).optional()),
  garage: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional()),
  notes: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional()),
})

// The one-tap "mark done": records the service, snapshots the next due
// schedule, advances the odometer, and keeps the legacy oil fields (used by the
// booking compliance guard) in sync for vidange.
export const logService = createServerFn({ method: 'POST' })
  .validator((d: unknown) => logServiceSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()

    const { data: plans } = await supabase.from('service_plans').select('*')
    const plan = resolvePlan(data.type, data.vehicle_id, (plans ?? []) as unknown as PlanRow[])

    const nextDueKm =
      data.odometer_km != null && plan.interval_km != null ? data.odometer_km + plan.interval_km : null
    const nextDueDate =
      plan.interval_months != null ? iso(addMonths(new Date(`${data.performed_at}T00:00:00`), plan.interval_months)) : null

    const { error } = await supabase.from('service_records').insert({
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      type: data.type,
      performed_at: data.performed_at,
      odometer_km: data.odometer_km ?? null,
      cost: data.cost ?? null,
      garage: data.garage ?? null,
      notes: data.notes ?? null,
      next_due_km: nextDueKm,
      next_due_date: nextDueDate,
      created_by: memberId,
    })
    if (error) throw new Error(error.message)

    // Odometer: single writer (forward-only). See server/mileage.ts.
    await advanceVehicleMileage(supabase, data.vehicle_id, data.odometer_km ?? null)
    // Legacy vidange snapshot mirror — no longer a source of truth (service_records
    // is), kept only so any old reader stays consistent.
    if (data.type === 'vidange' && data.odometer_km != null) {
      await supabase
        .from('vehicles')
        .update({ oil_change_last_km: data.odometer_km, oil_change_last_date: data.performed_at })
        .eq('id', data.vehicle_id)
    }
    await enqueueNotification(agencyId, 'service_record_created', {
      vehicle_id: data.vehicle_id,
      type: data.type,
      performed_at: data.performed_at,
      odometer_km: data.odometer_km,
      cost: data.cost,
      garage: data.garage,
      notes: data.notes,
    })
    return { ok: true }
  })

export const deleteServiceRecord = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase.from('service_records').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// Quick odometer correction (used from the maintenance UI without a full edit).
export const updateOdometer = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid(), km: z.coerce.number().int().min(0) }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase.from('vehicles').update({ mileage_current: data.km }).eq('id', data.vehicle_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ── Fleet-wide computed maintenance (hub queue + dashboard) ──
export type FleetVehicleLite = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  image_url: string | null
  mileage: number
  avg_km_per_day: number | null
}
export type FleetServiceRow = { vehicle_id: string; type: string } & ServiceCompute
export type FleetMaintenance = {
  vehicles: FleetVehicleLite[]
  plans: ServicePlan[]
  rows: FleetServiceRow[]
}

export const getFleetMaintenance = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FleetMaintenance> => {
    const { supabase } = await requireAgencyContext()
    const today = agencyToday()

    const [{ data: vehicles }, { data: planRows }, { data: records }, { data: contracts }] = await Promise.all([
      supabase.from('vehicles').select('id, plate, brand, model, image_keys, mileage_current, brands(name)').order('plate'),
      supabase.from('service_plans').select('*'),
      supabase.from('service_records').select('vehicle_id, type, performed_at, odometer_km').order('performed_at', { ascending: false }),
      supabase
        .from('contracts')
        .select('mileage_out, mileage_in, reservations(vehicle_id, date_start, date_end)')
        .not('mileage_in', 'is', null),
    ])

    // Average km/day per vehicle from completed rentals (mileage_in - out ÷ days).
    const usage = new Map<string, { km: number; days: number }>()
    for (const c of (contracts ?? []) as any[]) {
      const r = c.reservations
      const vId = r?.vehicle_id
      if (!vId || c.mileage_out == null || c.mileage_in == null) continue
      const km = c.mileage_in - c.mileage_out
      if (km <= 0) continue
      const days = Math.max(
        1,
        Math.round(
          (new Date(`${r.date_end}T00:00:00`).getTime() - new Date(`${r.date_start}T00:00:00`).getTime()) / 86_400_000,
        ),
      )
      const u = usage.get(vId) ?? { km: 0, days: 0 }
      u.km += km
      u.days += days
      usage.set(vId, u)
    }
    const avgFor = (id: string): number | null => {
      const u = usage.get(id)
      return u && u.days > 0 ? u.km / u.days : null
    }

    // Latest record per (vehicle, type) — records already sorted newest first.
    const latest = new Map<string, { odometer_km: number | null; performed_at: string }>()
    for (const rec of (records ?? []) as any[]) {
      const key = `${rec.vehicle_id}:${rec.type}`
      if (!latest.has(key)) latest.set(key, { odometer_km: rec.odometer_km ?? null, performed_at: rec.performed_at })
    }

    const plans = (planRows ?? []) as unknown as ServicePlan[]
    const vLite: FleetVehicleLite[] = (vehicles ?? []).map((v: any) => {
      const keys: string[] = v.image_keys ?? []
      return {
        id: v.id,
        plate: v.plate,
        brand: v.brand ?? v.brands?.name ?? null,
        model: v.model ?? null,
        image_url: keys[0] ? publicUrl(keys[0]) : null,
        mileage: v.mileage_current ?? 0,
        avg_km_per_day: avgFor(v.id),
      }
    })

    const rows: FleetServiceRow[] = []
    for (const v of vLite) {
      for (const type of PLANNED_TYPES) {
        const plan = resolvePlan(type, v.id, plans as unknown as PlanRow[])
        const last = latest.get(`${v.id}:${type}`)
        const compute = computeService({
          plan,
          lastKm: last?.odometer_km ?? null,
          lastDate: last?.performed_at ?? null,
          mileage: v.mileage,
          avgKmPerDay: v.avg_km_per_day,
          today,
        })
        rows.push({ vehicle_id: v.id, type, ...compute })
      }
    }

    return { vehicles: vLite, plans, rows }
  },
)

export { SERVICE_TYPES }
