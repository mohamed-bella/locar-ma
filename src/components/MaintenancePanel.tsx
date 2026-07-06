import { ShieldCheck, Receipt, ClipboardCheck, FileText, ShieldAlert } from 'lucide-react'
import type { Vehicle } from '~/server/fleet'
import type { AlertRule } from '~/server/alertRules'
import type { DocumentType } from '~/server/documentTypes'
import { daysUntil, condStatus, condTone, thresholdFor, LEGAL_FIELDS, type CondStatus } from '~/lib/fleet'
import { useI18n } from '~/lib/i18n'
import { Card, CardBody, CardHeader, Badge, cn } from '~/components/ui'

type T = (k: string, v?: Record<string, string | number>) => string

const LEGAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  insurance: ShieldCheck,
  vignette: Receipt,
  visite: ClipboardCheck,
}

const TILE: Record<CondStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-600',
  soon: 'bg-amber-50 text-amber-600',
  expired: 'bg-red-50 text-red-600',
  unknown: 'bg-[var(--color-surface-muted)] text-[var(--color-faint)]',
}

function condLabel(s: CondStatus, t: T) {
  return s === 'ok' ? t('vd.condOk') : s === 'soon' ? t('vd.condSoon') : s === 'expired' ? t('vd.condExpired') : t('vd.condUnknown')
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

// Legal / statutory papers only. Mechanical service now lives in ServicePanel.
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
      return { key: f.code, label: t(f.tKey), icon: LEGAL_ICONS[f.code] ?? FileText, date, days, status: condStatus(days, thresholdFor(f.key, alertRules)) }
    }),
    ...documentTypes.map((dt) => {
      const date = vehicle.document_expiries?.[dt.code] ?? null
      const days = daysUntil(date)
      return { key: dt.code, label: dt.name, icon: FileText, date, days, status: condStatus(days, thresholdFor(dt.code, alertRules)) }
    }),
  ]

  const rank: Record<CondStatus, number> = { expired: 3, soon: 2, ok: 1, unknown: 0 }
  const worst = legal.map((i) => i.status).reduce<CondStatus>((acc, s) => (rank[s] > rank[acc] ? s : acc), 'unknown')

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-[18px] w-[18px] text-[var(--color-brand)]" />
            {t('vd.legalCompliance')}
          </span>
        }
        subtitle={t('vd.mainComplianceSub')}
        action={
          worst === 'ok' ? (
            <Badge tone="ok" dot>
              {t('vd.roadReady')}
            </Badge>
          ) : (
            <Badge tone={condTone(worst)} dot>
              {worst === 'expired' && <ShieldAlert className="h-3 w-3" />}
              {condLabel(worst, t)}
            </Badge>
          )
        }
      />
      <CardBody>
        <ul className="grid gap-2 sm:grid-cols-2">
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
                <div className="truncate text-xs text-[var(--color-muted)] tnum">{item.date ?? t('vd.noDate')}</div>
              </div>
              <Badge tone={condTone(item.status)}>{daysText(item.days, t)}</Badge>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
