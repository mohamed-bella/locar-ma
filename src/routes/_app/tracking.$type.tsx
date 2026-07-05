import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  ShieldCheck,
  Receipt,
  ClipboardCheck,
  Droplet,
  FileText,
  Car,
} from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { findTracker, trackRows, type Tracker, type TrackRow } from '~/lib/tracking'
import { condTone, type CondStatus } from '~/lib/fleet'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, Card, EmptyState, PageHeader, cn } from '~/components/ui'

export const Route = createFileRoute('/_app/tracking/$type')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
    ])
    return { vehicles, alertRules, documentTypes }
  },
  component: TrackingDetail,
})

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  insurance: ShieldCheck,
  vignette: Receipt,
  visite: ClipboardCheck,
  vidange: Droplet,
}

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

type T = (k: string, v?: Record<string, string | number>) => string

function trackerName(tr: Tracker, t: T) {
  return tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code)
}
function condLabel(s: CondStatus, t: T) {
  return s === 'ok' ? t('vd.condOk') : s === 'soon' ? t('vd.condSoon') : s === 'expired' ? t('vd.condExpired') : t('vd.condUnknown')
}

function TrackingDetail() {
  const { vehicles, alertRules, documentTypes } = Route.useLoaderData()
  const { type } = Route.useParams()
  const { t } = useI18n()
  const router = useRouter()
  useRealtimeInvalidate('vehicles')

  const tracker = findTracker(type, documentTypes)
  if (!tracker) throw notFound()

  const rows = trackRows(vehicles, tracker, alertRules)
  const n = (s: CondStatus) => rows.filter((r) => r.status === s).length
  const Icon = ICONS[tracker.code] ?? FileText
  const name = trackerName(tracker, t)

  return (
    <div>
      <Link
        to="/tracking"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> {t('trk.title')}
      </Link>

      <div className="mt-3">
        <PageHeader
          title={
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <Icon className="h-5 w-5" />
              </span>
              {t('trk.suiviOf', { name })}
            </span>
          }
          subtitle={tracker.kind === 'km' ? t('trk.subKm') : t('trk.subDate')}
        />
      </div>

      {/* Urgency summary */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <SummaryTile label={t('vd.condExpired')} value={n('expired')} status="expired" />
        <SummaryTile label={t('vd.condSoon')} value={n('soon')} status="soon" />
        <SummaryTile label={t('vd.condOk')} value={n('ok')} status="ok" />
      </div>

      <Card className="mt-5">
        {rows.length === 0 ? (
          <EmptyState icon={Car} title={t('fleet.emptyTitle')} description={t('fleet.emptyDesc')} />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map((r) => (
              <Row key={r.vehicle.id} row={r} isKm={tracker.kind === 'km'} onOpen={() => router.navigate({ to: '/fleet/$vehicleId', params: { vehicleId: r.vehicle.id } })} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SummaryTile({ label, value, status }: { label: string; value: number; status: CondStatus }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', TILE[status])}>
          <span className={cn('h-2.5 w-2.5 rounded-full', BAR[status])} />
        </span>
        <span className="text-2xl font-black tnum text-[var(--color-ink)]">{value}</span>
      </div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  )
}

function Row({ row: r, isKm, onOpen }: { row: TrackRow; isKm: boolean; onOpen: () => void }) {
  const { t } = useI18n()
  const v = r.vehicle
  const title = [v.brand, v.model].filter(Boolean).join(' ') || v.plate

  const daysText =
    r.daysLeft === null ? '—' : r.daysLeft < 0 ? t('vd.overdue', { n: -r.daysLeft }) : t('vd.daysLeft', { n: r.daysLeft })

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-muted)]"
      >
        <div className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
          {v.image_urls[0] ? (
            <img src={v.image_urls[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <Car className="h-4 w-4 text-[var(--color-faint)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{v.plate}</div>
          <div className="truncate text-xs text-[var(--color-muted)]">{title}</div>
        </div>

        {isKm && r.km ? (
          <div className="hidden w-56 shrink-0 sm:block">
            <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
              <span className="tnum">
                {r.km.kmLeft != null && r.km.kmLeft <= 0
                  ? t('vd.oilOverdueBy', { km: Math.abs(r.km.kmLeft).toLocaleString() })
                  : r.km.nextKm != null
                    ? t('vd.oilInKm', { km: (r.km.kmLeft ?? 0).toLocaleString() })
                    : t('vd.condUnknown')}
              </span>
              <span className="tnum">{r.km.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
              <div className={cn('h-full rounded-full', BAR[r.status])} style={{ width: `${r.km.pct}%` }} />
            </div>
          </div>
        ) : (
          <div className="hidden w-40 shrink-0 text-right sm:block">
            <div className="text-sm font-semibold tnum text-[var(--color-ink)]">{r.date ?? t('vd.noDate')}</div>
            <div className="text-xs text-[var(--color-muted)]">{daysText}</div>
          </div>
        )}

        <Badge tone={condTone(r.status)}>{condLabel(r.status, t)}</Badge>
      </button>
    </li>
  )
}
