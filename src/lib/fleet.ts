import type { Vehicle } from '~/server/fleet'
import type { AlertRule } from '~/server/alertRules'

export const EXPIRY_FIELDS = [
  { key: 'insurance_expiry', label: 'Insurance' },
  { key: 'vignette_expiry', label: 'Vignette' },
  { key: 'visite_tech_expiry', label: 'Visite technique' },
] as const

export type Alert = { key: string; label: string; date: string; daysLeft: number }

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86_400_000)
}

// Expiries within configured dynamic database alert rules thresholds
export function vehicleAlerts(v: Vehicle, rules: AlertRule[] = []): Alert[] {
  const out: Alert[] = []
  for (const rule of rules) {
    const date = (v[rule.field as keyof Vehicle] as string | null) ||
                 (v.document_expiries?.[rule.field] as string | null)
    const d = daysUntil(date)
    if (d !== null && d <= rule.threshold_days) {
      out.push({
        key: `${rule.id}-${rule.field}`,
        label: rule.label,
        date: date!,
        daysLeft: d
      })
    }
  }
  return out
}

export const STATUS_STYLES: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  rented: 'bg-blue-100 text-blue-800',
  reserved: 'bg-amber-100 text-amber-800',
  maintenance: 'bg-red-100 text-red-800',
}

// ── Maintenance & Compliance ───────────────────────────
// Shared condition scale used by both legal papers (date-based) and
// mechanical service (mileage-based).
export type CondStatus = 'ok' | 'soon' | 'expired' | 'unknown'

export const SOON_DAYS = 30

export function condStatus(daysLeft: number | null, threshold = SOON_DAYS): CondStatus {
  if (daysLeft === null) return 'unknown'
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= threshold) return 'soon'
  return 'ok'
}

// Map a condition to a Badge tone.
export function condTone(s: CondStatus): 'ok' | 'warn' | 'danger' | 'neutral' {
  return s === 'ok' ? 'ok' : s === 'soon' ? 'warn' : s === 'expired' ? 'danger' : 'neutral'
}

// The three statutory Moroccan papers every vehicle must keep current.
export const LEGAL_FIELDS = [
  { key: 'insurance_expiry', code: 'insurance', tKey: 'vd.insurance' },
  { key: 'vignette_expiry', code: 'vignette', tKey: 'vd.vignette' },
  { key: 'visite_tech_expiry', code: 'visite', tKey: 'vd.visiteTech' },
] as const

// Look up a per-field alert threshold (falls back to SOON_DAYS).
export function thresholdFor(field: string, rules: AlertRule[]): number {
  const r = rules.find((x) => x.field === field)
  return r ? r.threshold_days : SOON_DAYS
}

export type OilChange = {
  lastKm: number | null
  intervalKm: number
  nextKm: number | null
  kmLeft: number | null
  pct: number // 0..100 progress through the interval
  status: CondStatus
  lastDate: string | null
}

// Mileage-based vidange (oil change) computation.
export function oilChange(v: Vehicle): OilChange {
  const intervalKm = v.oil_change_interval_km || 10000
  const lastKm = v.oil_change_last_km ?? null
  const nextKm = lastKm != null ? lastKm + intervalKm : null
  const kmLeft = nextKm != null ? nextKm - v.mileage_current : null
  const used = lastKm != null ? Math.max(0, v.mileage_current - lastKm) : 0
  const pct = intervalKm > 0 ? Math.min(100, Math.round((used / intervalKm) * 100)) : 0
  let status: CondStatus = 'unknown'
  if (kmLeft != null) status = kmLeft <= 0 ? 'expired' : kmLeft <= 1000 ? 'soon' : 'ok'
  return { lastKm, intervalKm, nextKm, kmLeft, pct, status, lastDate: v.oil_change_last_date ?? null }
}
