import {
  ShieldCheck,
  Receipt,
  ClipboardCheck,
  FileText,
  Droplet,
  Wrench,
  Gauge,
  CheckCircle2,
} from 'lucide-react'
import type { Vehicle } from '~/server/fleet'
import type { AlertRule } from '~/server/alertRules'
import type { DocumentType } from '~/server/documentTypes'
import {
  daysUntil,
  condStatus,
  condTone,
  oilChange,
  thresholdFor,
  LEGAL_FIELDS,
  type CondStatus,
} from '~/lib/fleet'
import { useI18n } from '~/lib/i18n'
import { Card, CardBody, CardHeader, Badge, cn } from '~/components/ui'

type T = (k: string, v?: Record<string, string | number>) => string

const LEGAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  insurance: ShieldCheck,
  vignette: Receipt,
  visite: ClipboardCheck,
}

// icon tile tint by condition
const TILE: Record<CondStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-600',
  soon: 'bg-amber-50 text-amber-600',
  expired: 'bg-red-50 text-red-600',
  unknown: 'bg-[var(--color-surface-muted)] text-[var(--color-faint)]',
}

const BAR: Record<CondStatus, string> = {
  ok: 'bg-emerald-500',
  soon: 'bg-amber-500',
  expired: 'bg-red-500',
  unknown: 'bg-[var(--color-line-strong)]',
}

function condLabel(s: CondStatus, t: T) {
  return s === 'ok'
    ? t('vd.condOk')
    : s === 'soon'
      ? t('vd.condSoon')
      : s === 'expired'
        ? t('vd.condExpired')
        : t('vd.condUnknown')
}

function daysText(days: number | null, t: T) {
  if (days === null) return '—'
  return days < 0 ? t('vd.overdue', { n: -days }) : t('vd.daysLeft', { n: days })
}

type Item = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  date: string | null
  days: number | null
  status: CondStatus
}

export function MaintenancePanel({
  vehicle,
  alertRules,
  documentTypes,
}: {
  vehicle: Vehicle
  alertRules: AlertRule[]
  documentTypes: DocumentType[]
}) {
  const { t } = useI18n()

  const legal: Item[] = [
    ...LEGAL_FIELDS.map((f) => {
      const date = (vehicle[f.key] as string | null) ?? null
      const days = daysUntil(date)
      return {
        key: f.code,
        label: t(f.tKey),
        icon: LEGAL_ICONS[f.code] ?? FileText,
        date,
        days,
        status: condStatus(days, thresholdFor(f.key, alertRules)),
      }
    }),
    ...documentTypes.map((dt) => {
      const date = vehicle.document_expiries?.[dt.code] ?? null
      const days = daysUntil(date)
      return {
        key: dt.code,
        label: dt.name,
        icon: FileText,
        date,
        days,
        status: condStatus(days, thresholdFor(dt.code, alertRules)),
      }
    }),
  ]

  const oil = oilChange(vehicle)

  // Worst status across the whole board → header summary.
  const rank: Record<CondStatus, number> = { expired: 3, soon: 2, ok: 1, unknown: 0 }
  const worst = [...legal.map((i) => i.status), oil.status].reduce<CondStatus>(
    (acc, s) => (rank[s] > rank[acc] ? s : acc),
    'unknown',
  )
  const allClear = worst === 'ok'

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Wrench className="h-[18px] w-[18px] text-[var(--color-brand)]" />
            {t('vd.mainCompliance')}
          </span>
        }
        subtitle={t('vd.mainComplianceSub')}
        action={
          allClear ? (
            <Badge tone="ok" dot>
              {t('vd.roadReady')}
            </Badge>
          ) : (
            <Badge tone={condTone(worst)} dot>
              {condLabel(worst, t)}
            </Badge>
          )
        }
      />
      <CardBody className="grid gap-6 lg:grid-cols-2">
        {/* ── Legal / compliance ── */}
        <section>
          <SectionLabel>{t('vd.legalCompliance')}</SectionLabel>
          <ul className="mt-3 space-y-2">
            {legal.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 shadow-[var(--shadow-card)]"
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE[item.status])}>
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{item.label}</div>
                  <div className="truncate text-xs text-[var(--color-muted)] tnum">
                    {item.date ?? t('vd.noDate')}
                  </div>
                </div>
                <Badge tone={condTone(item.status)}>{daysText(item.days, t)}</Badge>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Mechanical / vidange ── */}
        <section>
          <SectionLabel>{t('vd.mechanical')}</SectionLabel>
          <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE[oil.status])}>
                <Droplet className="h-[18px] w-[18px]" />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--color-ink)]">{t('vd.oilChange')}</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {t('vd.everyKm', { km: oil.intervalKm.toLocaleString() })}
                </div>
              </div>
              <Badge tone={condTone(oil.status)}>{condLabel(oil.status, t)}</Badge>
            </div>

            {oil.lastKm == null ? (
              <p className="mt-4 rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-xs text-[var(--color-muted)]">
                {t('vd.oilNotSet')}
              </p>
            ) : (
              <>
                {/* interval progress */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-[var(--color-muted)]">
                      {oil.kmLeft != null && oil.kmLeft <= 0
                        ? t('vd.oilOverdueBy', { km: Math.abs(oil.kmLeft).toLocaleString() })
                        : t('vd.oilInKm', { km: (oil.kmLeft ?? 0).toLocaleString() })}
                    </span>
                    <span className="font-semibold tnum text-[var(--color-ink)]">{oil.pct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)] shadow-[inset_0_1px_2px_rgba(16,24,40,0.1)]">
                    <div className={cn('h-full rounded-full', BAR[oil.status])} style={{ width: `${oil.pct}%` }} />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Stat icon={Gauge} label={t('vd.currentKm')} value={`${vehicle.mileage_current.toLocaleString()}`} />
                  <Stat icon={Wrench} label={t('vd.lastServiceKm')} value={`${oil.lastKm.toLocaleString()}`} />
                  <Stat
                    icon={CheckCircle2}
                    label={t('vd.nextServiceKm')}
                    value={oil.nextKm != null ? `${oil.nextKm.toLocaleString()}` : '—'}
                  />
                </dl>
                {oil.lastDate && (
                  <div className="mt-3 text-center text-xs text-[var(--color-faint)]">
                    {t('vd.lastServiceOn', { date: oil.lastDate })}
                  </div>
                )}
              </>
            )}

            {vehicle.next_service_note && (
              <div className="mt-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
                {vehicle.next_service_note}
              </div>
            )}
          </div>
        </section>
      </CardBody>
    </Card>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">{children}</h4>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-muted)] px-2 py-2.5">
      <Icon className="mx-auto h-4 w-4 text-[var(--color-faint)]" />
      <dd className="mt-1 text-sm font-black tnum text-[var(--color-ink)]">{value}</dd>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">{label}</dt>
    </div>
  )
}
