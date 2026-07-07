import { useI18n } from '~/lib/i18n'
import type { LegalInput, ServiceInput } from '~/lib/intelligence'
import { serviceOverdueKind } from '~/lib/maintenance'
import { PngIcon, StatusDot, legalIconPath, serviceIconPath } from './Icon'

// One calm, scannable list of the car's health items — legal papers + mechanical
// service — each a PNG icon, a name, a short due value, and a status dot. Service
// rows expose a single tap: "done".
export function HealthList({
  legal,
  service,
  onLogService,
}: {
  legal: LegalInput[]
  service: ServiceInput[]
  onLogService: (type: string) => void
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white">
      <Section title={t('vd.legalCompliance')}>
        {legal.map((l) => (
          <Row key={l.code} icon={legalIconPath(l.code)} label={l.label} due={legalDue(l, t)} status={l.status} />
        ))}
      </Section>
      <Section title={t('vd.mechanical')}>
        {service.map((s) => (
          <Row
            key={s.type}
            icon={serviceIconPath(s.type)}
            label={s.label}
            due={serviceDue(s, t)}
            status={s.status}
            action={
              <button
                onClick={() => onLogService(s.type)}
                className="text-xs font-semibold text-[var(--color-brand)] hover:underline"
              >
                {t('svc.markDone')}
              </button>
            }
          />
        ))}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-line)] last:border-b-0">
      <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">{title}</div>
      <ul className="px-1 py-1">{children}</ul>
    </div>
  )
}

function Row({
  icon,
  label,
  due,
  status,
  action,
}: {
  icon: string
  label: string
  due: string
  status: 'ok' | 'soon' | 'expired' | 'unknown'
  action?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <PngIcon path={icon} size={22} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-ink)]">{label}</span>
      {action}
      <span className="text-xs tnum text-[var(--color-muted)]">{due}</span>
      <StatusDot status={status} />
    </li>
  )
}

type T = (k: string, v?: Record<string, string | number>) => string

function legalDue(l: LegalInput, t: T): string {
  if (l.status === 'expired') return t('vd.condExpired')
  if (l.daysLeft != null) return t('vd.daysLeft', { n: l.daysLeft })
  return '—'
}

function serviceDue(s: ServiceInput, t: T): string {
  if (s.status === 'expired') {
    const kind = serviceOverdueKind(s.type)
    return kind === 'inspect' ? t('si.overdueInspect') : kind === 'replace' ? t('si.overdueReplace') : t('si.overdueBlock')
  }
  if (s.kmLeft != null) return `${s.kmLeft.toLocaleString()} km`
  if (s.etaDays != null) return t('vd.daysLeft', { n: s.etaDays })
  return '—'
}
