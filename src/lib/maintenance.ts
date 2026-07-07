import { addMonths, differenceInCalendarDays } from 'date-fns'

// ── Service ("entretien") model ────────────────────────
// Mechanical maintenance is dual-axis: a service is due at a km threshold OR a
// time threshold, WHICHEVER COMES FIRST — exactly how a garage schedules it.

export const SERVICE_TYPES = ['vidange', 'courroie', 'freins', 'pneus', 'filtre', 'batterie', 'autre'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export type PlanShape = {
  interval_km: number | null
  interval_months: number | null
  soon_km: number
  soon_days: number
}

// What being past-due actually MEANS for this service — the crux of why a single
// template is wrong. It drives both the wording and whether the car is grounded.
//   block   → real risk if driven overdue → car becomes non-rentable
//   inspect → a *check* is due; wear can't be inferred from km, so never auto-grounds
//   replace → part is worn/aged; advise replacement, but the car can still go out
export type OverdueKind = 'block' | 'inspect' | 'replace'
export type Axis = 'km' | 'time'

export type ServiceStrategy = {
  axes: Axis[] // which axes govern this service (battery = time only)
  overdue: OverdueKind
  defaults: PlanShape
}

// Each entretien has its OWN scheduling logic — not one shared template.
// Moroccan-fleet (diesel-heavy) defaults; each is overridable fleet-wide or per car.
export const SERVICE_STRATEGIES: Record<ServiceType, ServiceStrategy> = {
  // Oil: the classic km∧time, whichever first. Overdue = engine wear → block.
  vidange: { axes: ['km', 'time'], overdue: 'block', defaults: { interval_km: 10000, interval_months: 12, soon_km: 1000, soon_days: 30 } },
  // Timing belt: rare but catastrophic. Warn months / thousands of km ahead. Overdue = HARD block.
  courroie: { axes: ['km', 'time'], overdue: 'block', defaults: { interval_km: 60000, interval_months: 60, soon_km: 3000, soon_days: 90 } },
  // Brakes: pad wear isn't linear in km — this is an INSPECTION cadence, not a replacement clock.
  freins: { axes: ['km', 'time'], overdue: 'inspect', defaults: { interval_km: 20000, interval_months: 12, soon_km: 2000, soon_days: 45 } },
  // Tyres: worn by km AND aged by time (rubber perishes ~6yr) — whichever comes first; then inspect.
  pneus: { axes: ['km', 'time'], overdue: 'inspect', defaults: { interval_km: 40000, interval_months: 72, soon_km: 3000, soon_days: 60 } },
  // Filters: cheap consumable on a km/time clock. Overdue = replace, not a blocker.
  filtre: { axes: ['km', 'time'], overdue: 'replace', defaults: { interval_km: 15000, interval_months: 12, soon_km: 1000, soon_days: 30 } },
  // Battery: dies of AGE, not mileage. Time-only. Overdue = replace.
  batterie: { axes: ['time'], overdue: 'replace', defaults: { interval_km: null, interval_months: 48, soon_km: 0, soon_days: 60 } },
  // Catch-all: no schedule, history only.
  autre: { axes: [], overdue: 'replace', defaults: { interval_km: null, interval_months: null, soon_km: 1000, soon_days: 30 } },
}

export function strategyFor(type: string): ServiceStrategy {
  return SERVICE_STRATEGIES[type as ServiceType] ?? SERVICE_STRATEGIES.autre
}

// Does letting THIS service lapse take the car off the road? Only 'block' types.
export function serviceBlocksRental(type: string): boolean {
  return strategyFor(type).overdue === 'block'
}

export function serviceOverdueKind(type: string): OverdueKind {
  return strategyFor(type).overdue
}

// Back-compat: the raw plan shapes, derived from the strategies.
export const DEFAULT_PLANS: Record<ServiceType, PlanShape> = Object.fromEntries(
  (Object.keys(SERVICE_STRATEGIES) as ServiceType[]).map((k) => [k, SERVICE_STRATEGIES[k].defaults]),
) as Record<ServiceType, PlanShape>

export type ServiceStatus = 'ok' | 'soon' | 'expired' | 'unknown'

export type ServiceCompute = {
  status: ServiceStatus
  dueKm: number | null
  dueDate: string | null // yyyy-mm-dd
  kmLeft: number | null
  daysLeft: number | null
  etaDays: number | null // predicted days until due (min of time axis & km projection)
  pct: number // 0..100 progress through the interval (worst axis)
  lastKm: number | null
  lastDate: string | null
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// The heart of the redesign: given a plan, the last service, current odometer,
// the car's average km/day, and today, work out how urgent this service is on
// BOTH axes and take the nearer one.
export function computeService(opts: {
  plan: PlanShape
  lastKm: number | null
  lastDate: string | null
  mileage: number
  avgKmPerDay: number | null
  today: string
}): ServiceCompute {
  const { plan, lastKm, lastDate, mileage, avgKmPerDay, today } = opts

  const dueKm = lastKm != null && plan.interval_km != null ? lastKm + plan.interval_km : null
  const dueDateObj =
    lastDate && plan.interval_months != null ? addMonths(new Date(`${lastDate}T00:00:00`), plan.interval_months) : null
  const dueDate = dueDateObj ? iso(dueDateObj) : null

  const kmLeft = dueKm != null ? dueKm - mileage : null
  const daysLeft = dueDate ? differenceInCalendarDays(new Date(`${dueDate}T00:00:00`), new Date(`${today}T00:00:00`)) : null

  // Predicted days-to-due from the km axis, using the car's usage rate.
  const etaFromKm = kmLeft != null && avgKmPerDay && avgKmPerDay > 0 ? kmLeft / avgKmPerDay : null
  const etaCandidates = [daysLeft, etaFromKm].filter((n): n is number => n != null)
  const etaDays = etaCandidates.length ? Math.round(Math.min(...etaCandidates)) : null

  // Progress on each axis; show the worst so a bar never understates urgency.
  const kmPct =
    dueKm != null && plan.interval_km ? ((mileage - (lastKm ?? 0)) / plan.interval_km) * 100 : null
  const datePct =
    dueDateObj && lastDate && plan.interval_months
      ? (differenceInCalendarDays(new Date(`${today}T00:00:00`), new Date(`${lastDate}T00:00:00`)) /
          differenceInCalendarDays(dueDateObj, new Date(`${lastDate}T00:00:00`))) *
        100
      : null
  const pctRaw = Math.max(kmPct ?? 0, datePct ?? 0)
  const pct = Math.max(0, Math.min(100, Math.round(pctRaw)))

  let status: ServiceStatus
  if (lastKm == null && lastDate == null) {
    status = 'unknown'
  } else if ((kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0)) {
    status = 'expired'
  } else if ((kmLeft != null && kmLeft <= plan.soon_km) || (daysLeft != null && daysLeft <= plan.soon_days)) {
    status = 'soon'
  } else {
    status = 'ok'
  }

  return { status, dueKm, dueDate, kmLeft, daysLeft, etaDays, pct, lastKm, lastDate }
}

// A stored plan row (fleet default when vehicle_id is null, else a per-car
// override). Resolution order: car override → fleet default → hardcoded default.
export type PlanRow = PlanShape & { type: string; vehicle_id: string | null }

export function resolvePlan(type: string, vehicleId: string, plans: PlanRow[]): PlanShape {
  const override = plans.find((p) => p.type === type && p.vehicle_id === vehicleId)
  if (override) return override
  const def = plans.find((p) => p.type === type && p.vehicle_id == null)
  if (def) return def
  return DEFAULT_PLANS[type as ServiceType] ?? DEFAULT_PLANS.autre
}

// Scheduled types (excludes 'autre', which has no interval and is log-only).
export const PLANNED_TYPES = SERVICE_TYPES.filter((t) => t !== 'autre') as ServiceType[]

export const SERVICE_RANK: Record<ServiceStatus, number> = { expired: 0, soon: 1, ok: 2, unknown: 3 }

export function serviceTone(s: ServiceStatus): 'ok' | 'warn' | 'danger' | 'neutral' {
  return s === 'ok' ? 'ok' : s === 'soon' ? 'warn' : s === 'expired' ? 'danger' : 'neutral'
}
