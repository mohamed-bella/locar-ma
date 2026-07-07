import { useMemo, useState } from 'react'
import { createFileRoute, Link, useRouter, notFound } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowLeft, Car, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getVehicle, listDamageReports } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { getFleetMaintenance, listServiceRecords } from '~/server/maintenance'
import { listVehicleIssues, updateIssue, deleteIssue, type VehicleIssue } from '~/server/intelligence'
import { legalInputs, serviceInputs, issueInputs } from '~/lib/suivi'
import { computeVehicleState, isRentable } from '~/lib/intelligence'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Button, EmptyState, cn } from '~/components/ui'
import { LogServiceSheet } from '~/components/LogServiceSheet'
import { StatusPill } from '~/components/suivi/StatusPill'
import { HealthList } from '~/components/suivi/HealthList'
import { QuickCheckDialog } from '~/components/suivi/QuickCheckDialog'
import { IssueDialog } from '~/components/suivi/IssueDialog'
import { PngIcon, statusIconPath, serviceIconPath, severityIconPath } from '~/components/suivi/Icon'

export const Route = createFileRoute('/_app/suivi/$vehicleId')({
  loader: async ({ params }) => {
    const [vehicle, alertRules, documentTypes, maintenance, serviceRecords, issues, damage] =
      await Promise.all([
        getVehicle({ data: { id: params.vehicleId } }),
        listAlertRules(),
        listDocumentTypes(),
        getFleetMaintenance(),
        listServiceRecords({ data: { vehicle_id: params.vehicleId } }),
        listVehicleIssues({ data: { vehicle_id: params.vehicleId } }),
        listDamageReports({ data: { vehicle_id: params.vehicleId } }),
      ])
    if (!vehicle) throw notFound()
    return { vehicle, alertRules, documentTypes, maintenance, serviceRecords, issues, damage }
  },
  component: SuiviDetail,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
    </div>
  ),
  notFoundComponent: () => {
    const { t } = useI18n()
    return (
      <EmptyState
        icon={Car}
        title={t('fleet.notFound')}
        description={t('fleet.notFoundDesc')}
        action={
          <Link to="/suivi">
            <Button variant="secondary">{t('si.backToSuivi')}</Button>
          </Link>
        }
      />
    )
  },
})

function SuiviDetail() {
  const { vehicle, alertRules, documentTypes, maintenance, serviceRecords, issues, damage } =
    Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()
  const [checkOpen, setCheckOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueKind, setIssueKind] = useState('problem')
  const [logType, setLogType] = useState<string | null>(null)

  useRealtimeInvalidate('vehicles', `id=eq.${vehicle.id}`)
  useRealtimeInvalidate('service_records')
  useRealtimeInvalidate('vehicle_issues', `vehicle_id=eq.${vehicle.id}`)

  const legal = useMemo(() => legalInputs(vehicle, alertRules, documentTypes, t), [vehicle, alertRules, documentTypes, t])
  const service = useMemo(() => serviceInputs(vehicle.id, maintenance.rows, t), [vehicle.id, maintenance.rows, t])
  const state = useMemo(
    () => computeVehicleState({ legal, service, issues: issueInputs(issues) }),
    [legal, service, issues],
  )

  const title = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || vehicle.plate
  const rentable = isRentable(state.status)
  const openIssues = issues.filter((i) => i.status !== 'resolved')

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/suivi" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        <ArrowLeft className="h-4 w-4" /> {t('si.title')}
      </Link>

      {/* Clean header */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight text-[var(--color-ink)]">{title}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-faint)]">
            <span className="font-mono">{vehicle.plate}</span>
            <span>·</span>
            <span className="tnum">{vehicle.mileage_current.toLocaleString()} km</span>
          </div>
        </div>
        <PngIcon path={statusIconPath(state.status)} size={40} />
      </div>

      {/* The decision */}
      <div
        className={cn(
          'mt-4 rounded-2xl border p-4',
          rentable ? 'border-[var(--color-line)] bg-white' : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/40',
        )}
      >
        <div className="flex items-center gap-2">
          <StatusPill status={state.status} />
          <span className="ml-auto text-sm font-bold tnum text-[var(--color-ink-soft)]">{state.scoreOverall}%</span>
        </div>
        <p className={cn('mt-1 text-sm font-semibold', rentable ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]')}>
          {rentable ? t('si.canRent') : t('si.cannotRent')}
        </p>
        {state.blocks.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-soft)]">
            {state.blocks.map((b) => (
              <li key={b.code} className="flex gap-2">
                <span className="text-[var(--color-danger)]">·</span>
                <span>{t(b.label.key, b.label.params)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <ActionButton icon="action/check-rapide" label={t('si.quickCheck')} onClick={() => setCheckOpen(true)} />
        <ActionButton icon="action/declarer-probleme" label={t('si.declareProblem')} onClick={() => { setIssueKind('problem'); setIssueOpen(true) }} />
        <ActionButton icon="action/envoyer-garage" label={t('si.isSendGarage')} onClick={() => { setIssueKind('garage'); setIssueOpen(true) }} />
      </div>

      {/* Scores — plain text, no color bars */}
      <div className="mt-4 flex gap-6 text-sm">
        <span className="text-[var(--color-muted)]">
          {t('si.scoreTech')} <span className="font-bold text-[var(--color-ink)] tnum">{state.scoreTech}%</span>
        </span>
        <span className="text-[var(--color-muted)]">
          {t('si.scoreAdmin')} <span className="font-bold text-[var(--color-ink)] tnum">{state.scoreAdmin}%</span>
        </span>
      </div>

      {/* Health list */}
      <div className="mt-5">
        <HealthList legal={legal} service={service} onLogService={(type) => setLogType(type)} />
      </div>

      {/* Open problems */}
      {openIssues.length > 0 && (
        <div className="mt-5">
          <SectionTitle>{t('si.openIssues')}</SectionTitle>
          <div className="mt-2 rounded-2xl border border-[var(--color-line)] bg-white">
            <ul className="p-1">
              {openIssues.map((i) => (
                <IssueRow key={i.id} issue={i} onChanged={() => router.invalidate()} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-5">
        <SectionTitle>{t('si.timeline')}</SectionTitle>
        <Timeline issues={issues} serviceRecords={serviceRecords} damage={damage} />
      </div>

      {checkOpen && (
        <QuickCheckDialog open={checkOpen} onOpenChange={setCheckOpen} vehicleId={vehicle.id} defaultMileage={vehicle.mileage_current} onDone={() => router.invalidate()} />
      )}
      {issueOpen && (
        <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} vehicleId={vehicle.id} defaultKind={issueKind} onDone={() => router.invalidate()} />
      )}
      {logType && (
        <LogServiceSheet
          open={!!logType}
          onOpenChange={(o) => !o && setLogType(null)}
          vehicleId={vehicle.id}
          defaultType={logType}
          defaultMileage={vehicle.mileage_current}
          onDone={() => {
            setLogType(null)
            router.invalidate()
          }}
        />
      )}
    </div>
  )
}

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--color-line)] bg-white px-2 py-3 text-center transition hover:border-[var(--color-brand)]"
    >
      <PngIcon path={icon} size={26} />
      <span className="text-[11px] font-semibold leading-tight text-[var(--color-ink-soft)]">{label}</span>
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">{children}</div>
}

function IssueRow({ issue, onChanged }: { issue: VehicleIssue; onChanged: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <PngIcon path={severityIconPath(issue.severity)} size={22} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-ink)]">{issue.title}</div>
        <div className="truncate text-xs text-[var(--color-faint)] tnum">
          {format(new Date(`${issue.opened_at}T00:00:00`), 'd MMM yyyy')}
          {issue.status === 'in_progress' ? ` · ${t('si.istatus.in_progress')}` : ''}
        </div>
      </div>
      <button
        onClick={() => act(() => updateIssue({ data: { id: issue.id, status: 'resolved' } }))}
        disabled={busy}
        className="shrink-0 text-xs font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-50"
      >
        {t('si.isResolve')}
      </button>
      <button
        onClick={() => act(() => deleteIssue({ data: { id: issue.id } }))}
        disabled={busy}
        className="shrink-0 rounded-lg p-1 hover:bg-black/5 disabled:opacity-50"
        aria-label={t('common.delete')}
      >
        <Trash2 className="h-4 w-4 text-[var(--color-faint)]" />
      </button>
    </li>
  )
}

type TimelineItem = { date: string; title: string; detail: string; icon: string }

function Timeline({
  issues,
  serviceRecords,
  damage,
}: {
  issues: VehicleIssue[]
  serviceRecords: Awaited<ReturnType<typeof listServiceRecords>>
  damage: Awaited<ReturnType<typeof listDamageReports>>
}) {
  const { t } = useI18n()

  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = []
    for (const s of serviceRecords) {
      out.push({
        date: s.performed_at,
        icon: serviceIconPath(s.type),
        title: t(`svc.type.${s.type}`),
        detail: [s.odometer_km != null ? `${s.odometer_km.toLocaleString()} km` : null, s.cost != null ? `${s.cost.toLocaleString()} MAD` : null, s.garage].filter(Boolean).join(' · '),
      })
    }
    for (const i of issues) {
      out.push({ date: i.opened_at, icon: severityIconPath(i.severity), title: i.title, detail: t(`si.kind.${i.kind}`) })
      if (i.resolved_at) out.push({ date: i.resolved_at, icon: 'action/resoudre', title: `${t('si.isResolved')}: ${i.title}`, detail: '' })
    }
    for (const d of damage) {
      out.push({ date: d.recorded_at.slice(0, 10), icon: 'check/dommage', title: t('vd.damageLog'), detail: d.notes ?? '' })
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [issues, serviceRecords, damage, t])

  if (items.length === 0) {
    return <p className="mt-2 py-6 text-center text-sm text-[var(--color-faint)]">{t('si.emptyTimeline')}</p>
  }

  return (
    <ol className="mt-2 space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-white">
            <PngIcon path={it.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--color-ink)]">{it.title}</div>
            {it.detail && <div className="truncate text-xs text-[var(--color-muted)]">{it.detail}</div>}
          </div>
          <span className="shrink-0 text-xs text-[var(--color-faint)] tnum">{format(new Date(`${it.date}T00:00:00`), 'd MMM')}</span>
        </li>
      ))}
    </ol>
  )
}
