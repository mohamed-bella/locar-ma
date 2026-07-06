import { useState } from 'react'
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowLeft, ShieldCheck, Receipt, ClipboardCheck, Droplet, Settings, Gauge, Wrench, FileText, Car } from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { getFleetMaintenance, type FleetServiceRow, type FleetVehicleLite } from '~/server/maintenance'
import { findTracker, trackRows, type TrackRow } from '~/lib/tracking'
import { PLANNED_TYPES, serviceTone } from '~/lib/maintenance'
import { condTone, type CondStatus } from '~/lib/fleet'
import { LogServiceSheet } from '~/components/LogServiceSheet'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, Card, EmptyState, PageHeader, cn } from '~/components/ui'

export const Route = createFileRoute('/_app/tracking/$type')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes, maintenance] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
      getFleetMaintenance(),
    ])
    return { vehicles, alertRules, documentTypes, maintenance }
  },
  component: TrackingDetail,
})

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  insurance: ShieldCheck,
  vignette: Receipt,
  visite: ClipboardCheck,
  vidange: Droplet,
  courroie: Settings,
  freins: Gauge,
  pneus: Wrench,
  filtre: Wrench,
}

const TILE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-600',
  soon: 'bg-amber-50 text-amber-600',
  expired: 'bg-red-50 text-red-600',
  unknown: 'bg-[var(--color-surface-muted)] text-[var(--color-faint)]',
}
const BAR: Record<string, string> = {
  ok: 'bg-emerald-500',
  soon: 'bg-amber-500',
  expired: 'bg-red-500',
  unknown: 'bg-[var(--color-line-strong)]',
}

type T = (k: string, v?: Record<string, string | number>) => string

function condLabel(s: CondStatus, t: T) {
  return s === 'ok' ? t('vd.condOk') : s === 'soon' ? t('vd.condSoon') : s === 'expired' ? t('vd.condExpired') : t('vd.condUnknown')
}

function TrackingDetail() {
  const { type } = Route.useParams()
  const isService = (PLANNED_TYPES as string[]).includes(type)
  return isService ? <ServiceView /> : <LegalView />
}

// ── Mechanical service view ────────────────────────────
function ServiceView() {
  const { maintenance } = Route.useLoaderData()
  const { type } = Route.useParams()
  const { t } = useI18n()
  const router = useRouter()
  useRealtimeInvalidate('service_records')

  const [log, setLog] = useState<{ vehicleId: string; mileage: number } | null>(null)

  const vehById = new Map(maintenance.vehicles.map((v) => [v.id, v]))
  const rows = maintenance.rows
    .filter((r) => r.type === type)
    .map((r) => ({ r, v: vehById.get(r.vehicle_id)! }))
    .filter((x) => x.v)
    .sort((a, b) => {
      const rank = { expired: 0, soon: 1, ok: 2, unknown: 3 } as const
      return rank[a.r.status] - rank[b.r.status] || (a.r.etaDays ?? 1e9) - (b.r.etaDays ?? 1e9)
    })

  const Icon = ICONS[type] ?? Wrench
  const n = (s: string) => rows.filter((x) => x.r.status === s).length

  return (
    <div>
      <BackLink />
      <div className="mt-3">
        <PageHeader
          title={
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <Icon className="h-5 w-5" />
              </span>
              {t('trk.suiviOf', { name: t(`svc.type.${type}`) })}
            </span>
          }
          subtitle={t('svc.subtitle')}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <SummaryTile label={t('svc.overdue')} value={n('expired')} status="expired" />
        <SummaryTile label={t('svc.dueNow')} value={n('soon')} status="soon" />
        <SummaryTile label={t('vd.condOk')} value={n('ok')} status="ok" />
      </div>

      <Card className="mt-5">
        {rows.length === 0 ? (
          <EmptyState icon={Car} title={t('fleet.emptyTitle')} description={t('fleet.emptyDesc')} />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map(({ r, v }) => (
              <ServiceRow
                key={v.id}
                row={r}
                vehicle={v}
                onOpen={() => router.navigate({ to: '/fleet/$vehicleId', params: { vehicleId: v.id } })}
                onLog={() => setLog({ vehicleId: v.id, mileage: v.mileage })}
              />
            ))}
          </ul>
        )}
      </Card>

      {log && (
        <LogServiceSheet
          open={!!log}
          onOpenChange={(o) => !o && setLog(null)}
          vehicleId={log.vehicleId}
          defaultType={type}
          defaultMileage={log.mileage}
          onDone={() => {
            setLog(null)
            router.invalidate()
          }}
        />
      )}
    </div>
  )
}

function ServiceRow({ row: r, vehicle: v, onOpen, onLog }: { row: FleetServiceRow; vehicle: FleetVehicleLite; onOpen: () => void; onLog: () => void }) {
  const { t } = useI18n()
  const title = [v.brand, v.model].filter(Boolean).join(' ') || v.plate
  const detail =
    r.status === 'unknown'
      ? t('svc.notLogged')
      : r.status === 'expired'
        ? r.kmLeft != null && r.kmLeft <= 0
          ? t('svc.overdueByKm', { km: Math.abs(r.kmLeft).toLocaleString() })
          : t('svc.overdueByDays', { n: Math.abs(r.daysLeft ?? 0) })
        : [
            r.kmLeft != null ? t('svc.kmLeft', { km: r.kmLeft.toLocaleString() }) : null,
            r.etaDays != null ? t('svc.dueInDays', { n: r.etaDays }) : r.dueDate ? t('svc.dueDate', { date: format(new Date(`${r.dueDate}T00:00:00`), 'd MMM yyyy') }) : null,
          ].filter(Boolean).join(' · ')

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
          {v.image_url ? (
            <img src={v.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <Car className="h-4 w-4 text-[var(--color-faint)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{v.plate}</div>
          <div className="truncate text-xs text-[var(--color-muted)]">{title}</div>
        </div>
        {r.status !== 'unknown' && (
          <div className="hidden w-40 shrink-0 sm:block">
            <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--color-muted)] tnum">
              <span className="truncate">{detail}</span>
              <span>{r.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
              <div className={cn('h-full rounded-full', BAR[r.status])} style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        )}
      </button>
      <Badge tone={serviceTone(r.status)}>
        {r.status === 'expired' ? t('svc.overdue') : r.status === 'soon' ? t('svc.dueNow') : r.status === 'ok' ? t('vd.condOk') : '—'}
      </Badge>
      <Button size="sm" variant="secondary" onClick={onLog}>
        {r.status === 'unknown' ? t('svc.setBaseline') : t('svc.markDone')}
      </Button>
    </li>
  )
}

// ── Legal / paper view (unchanged behaviour) ───────────
function LegalView() {
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
  const name = tracker.nameKey ? t(tracker.nameKey) : (tracker.name ?? tracker.code)

  return (
    <div>
      <BackLink />
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
          subtitle={t('trk.subDate')}
        />
      </div>

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
              <LegalRow key={r.vehicle.id} row={r} onOpen={() => router.navigate({ to: '/fleet/$vehicleId', params: { vehicleId: r.vehicle.id } })} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function LegalRow({ row: r, onOpen }: { row: TrackRow; onOpen: () => void }) {
  const { t } = useI18n()
  const v = r.vehicle
  const title = [v.brand, v.model].filter(Boolean).join(' ') || v.plate
  const daysText = r.daysLeft === null ? '—' : r.daysLeft < 0 ? t('vd.overdue', { n: -r.daysLeft }) : t('vd.daysLeft', { n: r.daysLeft })
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-muted)]">
        <div className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
          {v.image_urls[0] ? (
            <img src={v.image_urls[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <Car className="h-4 w-4 text-[var(--color-faint)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{v.plate}</div>
          <div className="truncate text-xs text-[var(--color-muted)]">{title}</div>
        </div>
        <div className="hidden w-40 shrink-0 text-right sm:block">
          <div className="text-sm font-semibold tnum text-[var(--color-ink)]">{r.date ?? t('vd.noDate')}</div>
          <div className="text-xs text-[var(--color-muted)]">{daysText}</div>
        </div>
        <Badge tone={condTone(r.status)}>{condLabel(r.status, t)}</Badge>
      </button>
    </li>
  )
}

function BackLink() {
  const { t } = useI18n()
  return (
    <Link to="/tracking" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]">
      <ArrowLeft className="h-4 w-4" /> {t('trk.title')}
    </Link>
  )
}

function SummaryTile({ label, value, status }: { label: string; value: number; status: string }) {
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
