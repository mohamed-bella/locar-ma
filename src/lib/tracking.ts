import type { Vehicle } from '~/server/fleet'
import type { AlertRule } from '~/server/alertRules'
import type { DocumentType } from '~/server/documentTypes'
import { daysUntil, condStatus, oilChange, thresholdFor, type CondStatus } from './fleet'

// A "suivi" = one thing tracked across the whole fleet: a legal paper (date
// based), the oil change (mileage based), or a custom document type.
export type Tracker = {
  code: string
  kind: 'date' | 'km'
  field?: string // date column or custom doc code
  nameKey?: string // i18n key for built-ins
  name?: string // literal name for custom types
}

const LEGAL_FIELDS = new Set(['insurance_expiry', 'vignette_expiry', 'visite_tech_expiry'])

export const LEGAL_TRACKERS: Tracker[] = [
  { code: 'insurance', kind: 'date', field: 'insurance_expiry', nameKey: 'vd.insurance' },
  { code: 'vignette', kind: 'date', field: 'vignette_expiry', nameKey: 'vd.vignette' },
  { code: 'visite', kind: 'date', field: 'visite_tech_expiry', nameKey: 'vd.visiteTech' },
  { code: 'vidange', kind: 'km', nameKey: 'vd.oilChange' },
]

export function allTrackers(documentTypes: DocumentType[]): Tracker[] {
  return [
    ...LEGAL_TRACKERS,
    ...documentTypes.map((dt): Tracker => ({ code: dt.code, kind: 'date', field: dt.code, name: dt.name })),
  ]
}

export function findTracker(code: string, documentTypes: DocumentType[]): Tracker | null {
  return allTrackers(documentTypes).find((tr) => tr.code === code) ?? null
}

export function trackerDate(v: Vehicle, tr: Tracker): string | null {
  if (tr.kind !== 'date' || !tr.field) return null
  if (LEGAL_FIELDS.has(tr.field)) return ((v as any)[tr.field] as string | null) ?? null
  return v.document_expiries?.[tr.field] ?? null
}

export type TrackRow = {
  vehicle: Vehicle
  status: CondStatus
  date: string | null
  daysLeft: number | null
  km: { currentKm: number; nextKm: number | null; kmLeft: number | null; pct: number } | null
}

const RANK: Record<CondStatus, number> = { expired: 0, soon: 1, ok: 2, unknown: 3 }

export function trackRows(vehicles: Vehicle[], tr: Tracker, rules: AlertRule[]): TrackRow[] {
  const rows = vehicles.map((v): TrackRow => {
    if (tr.kind === 'km') {
      const o = oilChange(v)
      return {
        vehicle: v,
        status: o.status,
        date: o.lastDate,
        daysLeft: null,
        km: { currentKm: v.mileage_current, nextKm: o.nextKm, kmLeft: o.kmLeft, pct: o.pct },
      }
    }
    const date = trackerDate(v, tr)
    const days = daysUntil(date)
    return { vehicle: v, status: condStatus(days, thresholdFor(tr.field!, rules)), date, daysLeft: days, km: null }
  })
  return rows.sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status]
    if (a.km && b.km) return (a.km.kmLeft ?? 1e9) - (b.km.kmLeft ?? 1e9)
    return (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)
  })
}

// Overdue + due-soon count for a tracker (for hub badges / dashboard hints).
export function dueCount(vehicles: Vehicle[], tr: Tracker, rules: AlertRule[]): number {
  return trackRows(vehicles, tr, rules).filter((r) => r.status === 'expired' || r.status === 'soon').length
}
