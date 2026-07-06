import { useMemo, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ShieldCheck, Receipt, ClipboardCheck, Droplet, FileText, Wrench, Settings, Gauge, CheckCircle2 } from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { getFleetMaintenance, type FleetServiceRow } from '~/server/maintenance'
import { allTrackers, dueCount, trackRows } from '~/lib/tracking'
import { PLANNED_TYPES } from '~/lib/maintenance'
import { LogServiceSheet } from '~/components/LogServiceSheet'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Badge, PageHeader, Button, cn } from '~/components/ui'

export const Route = createFileRoute('/_app/tracking/')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes, maintenance] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
      getFleetMaintenance(),
    ])
    return { vehicles, alertRules, documentTypes, maintenance }
  },
  component: TrackingHub,
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
const TONES: Record<string, { bg: string; chip: string }> = {
  insurance: { bg: 'bg-sky-50', chip: 'bg-sky-600' },
  vignette: { bg: 'bg-indigo-50', chip: 'bg-indigo-600' },
  visite: { bg: 'bg-emerald-50', chip: 'bg-emerald-600' },
  vidange: { bg: 'bg-amber-50', chip: 'bg-amber-500' },
  courroie: { bg: 'bg-rose-50', chip: 'bg-rose-500' },
  freins: { bg: 'bg-red-50', chip: 'bg-red-500' },
  pneus: { bg: 'bg-slate-100', chip: 'bg-slate-600' },
  filtre: { bg: 'bg-teal-50', chip: 'bg-teal-600' },
}
const CUSTOM_TONE = { bg: 'bg-slate-100', chip: 'bg-slate-600' }

type T = (k: string, v?: Record<string, string | number>) => string

type QueueItem = {
  vehicleId: string
  plate: string
  imageUrl: string | null
  title: string
  kind: 'legal' | 'service'
  serviceType?: string
  mileage?: number
  label: string
  status: 'expired' | 'soon'
  urgency: number // lower = sooner
  detail: string
}

function serviceDetail(r: FleetServiceRow, t: T): string {
  if (r.status === 'expired') {
    if (r.kmLeft != null && r.kmLeft <= 0) return t('svc.overdueByKm', { km: Math.abs(r.kmLeft).toLocaleString() })
    if (r.daysLeft != null && r.daysLeft <= 0) return t('svc.overdueByDays', { n: Math.abs(r.daysLeft) })
    return t('svc.overdue')
  }
  const parts: string[] = []
  if (r.kmLeft != null) parts.push(t('svc.kmLeft', { km: r.kmLeft.toLocaleString() }))
  if (r.etaDays != null) parts.push(t('svc.dueInDays', { n: r.etaDays }))
  else if (r.dueDate) parts.push(t('svc.dueDate', { date: format(new Date(`${r.dueDate}T00:00:00`), 'd MMM yyyy') }))
  return parts.join(' · ') || '—'
}

function TrackingHub() {
  const { vehicles, alertRules, documentTypes, maintenance } = Route.useLoaderData()
  const { t } = useI18n()
  const router = useRouter()
  useRealtimeInvalidate('vehicles')
  useRealtimeInvalidate('document_types')
  useRealtimeInvalidate('service_records')

  const [log, setLog] = useState<{ vehicleId: string; type: string; mileage: number } | null>(null)

  const dateTrackers = allTrackers(documentTypes) // legal papers + custom doc types
  const vehById = useMemo(() => new Map(maintenance.vehicles.map((v) => [v.id, v])), [maintenance.vehicles])

  // Unified "needs attention" queue: legal papers + mechanical service, merged.
  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = []

    for (const tr of dateTrackers) {
      for (const r of trackRows(vehicles, tr, alertRules)) {
        if (r.status !== 'expired' && r.status !== 'soon') continue
        const v = r.vehicle
        items.push({
          vehicleId: v.id,
          plate: v.plate,
          imageUrl: v.image_urls[0] ?? null,
          title: [v.brand, v.model].filter(Boolean).join(' ') || v.plate,
          kind: 'legal',
          label: tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code),
          status: r.status,
          urgency: r.daysLeft ?? 0,
          detail: r.date ? `${format(new Date(`${r.date}T00:00:00`), 'd MMM yyyy')} · ${r.daysLeft != null && r.daysLeft < 0 ? t('vd.overdue', { n: -r.daysLeft }) : t('vd.daysLeft', { n: r.daysLeft ?? 0 })}` : t('vd.noDate'),
        })
      }
    }

    for (const r of maintenance.rows) {
      if (r.status !== 'expired' && r.status !== 'soon') continue
      const v = vehById.get(r.vehicle_id)
      if (!v) continue
      items.push({
        vehicleId: v.id,
        plate: v.plate,
        imageUrl: v.image_url,
        title: [v.brand, v.model].filter(Boolean).join(' ') || v.plate,
        kind: 'service',
        serviceType: r.type,
        mileage: v.mileage,
        label: t(`svc.type.${r.type}`),
        status: r.status,
        urgency: r.etaDays ?? r.daysLeft ?? 0,
        detail: serviceDetail(r, t),
      })
    }

    const rank = { expired: 0, soon: 1 } as const
    return items.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.urgency - b.urgency))
  }, [vehicles, alertRules, dateTrackers, maintenance.rows, vehById, t])

  const serviceCount = (type: string) =>
    maintenance.rows.filter((r) => r.type === type && (r.status === 'expired' || r.status === 'soon')).length

  return (
    <div>
      <PageHeader title={t('trk.title')} subtitle={t('trk.subtitle')} />

      {/* Unified attention queue */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
            <Wrench className="h-4 w-4 text-[var(--color-brand)]" />
            {t('svc.attention')}
          </div>
          {queue.length > 0 && <Badge tone="danger">{t('svc.nItems', { n: queue.length })}</Badge>}
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-[var(--color-ok)]" />
            <p className="text-sm font-medium text-[var(--color-muted)]">{t('svc.allClear')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {queue.map((it, i) => {
              const Icon = ICONS[it.serviceType ?? ''] ?? (it.kind === 'legal' ? FileText : Wrench)
              return (
                <li
                  key={`${it.vehicleId}-${it.kind}-${it.serviceType ?? it.label}-${i}`}
                  className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', it.status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{it.plate}</span>
                        <span className="truncate text-xs text-[var(--color-muted)]">· {it.label}</span>
                      </div>
                      <div className="truncate text-xs text-[var(--color-muted)] tnum">{it.detail}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2.5 sm:justify-end shrink-0 w-full sm:w-auto">
                    <Badge tone={it.status === 'expired' ? 'danger' : 'warn'}>
                      {it.status === 'expired' ? t('svc.overdue') : t('svc.dueNow')}
                    </Badge>
                    {it.kind === 'service' ? (
                      <Button size="sm" variant="secondary" onClick={() => setLog({ vehicleId: it.vehicleId, type: it.serviceType!, mileage: it.mileage ?? 0 })}>
                        {t('svc.markDone')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => router.navigate({ to: '/fleet/$vehicleId', params: { vehicleId: it.vehicleId } })}>
                        {t('common.open')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Tracker cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {dateTrackers.map((tr) => (
          <TrackerCard key={tr.code} code={tr.code} name={tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code)} due={dueCount(vehicles, tr, alertRules)} />
        ))}
        {PLANNED_TYPES.map((type) => (
          <TrackerCard key={type} code={type} name={t(`svc.type.${type}`)} due={serviceCount(type)} />
        ))}
      </div>

      {log && (
        <LogServiceSheet
          open={!!log}
          onOpenChange={(o) => !o && setLog(null)}
          vehicleId={log.vehicleId}
          defaultType={log.type}
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

function TrackerCard({ code, name, due }: { code: string; name: string; due: number }) {
  const { t } = useI18n()
  const Icon = ICONS[code] ?? FileText
  const tone = TONES[code] ?? CUSTOM_TONE
  return (
    <Link
      to="/tracking/$type"
      params={{ type: code }}
      className={`group flex flex-col gap-2.5 sm:gap-3 rounded-2xl border border-[var(--color-line)] ${tone.bg} p-3.5 sm:p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-ring)] min-w-0`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl ${tone.chip} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(16,24,40,0.2)]`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        {due > 0 && (
          <span className="flex h-5 min-w-5 sm:h-6 sm:min-w-6 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 sm:px-1.5 text-[10px] sm:text-xs font-bold text-white">
            {due}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs sm:text-sm font-bold text-[var(--color-ink)] sm:text-base" title={name}>{name}</div>
        <div className="mt-0.5 text-[10px] sm:text-xs font-medium text-[var(--color-muted)] truncate">
          {due > 0 ? t('dash.nDue', { n: due }) : t('dash.upToDate')}
        </div>
      </div>
    </Link>
  )
}
