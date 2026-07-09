import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Wrench, Droplet, Gauge, Settings, Trash2, Coins, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { updateOdometer, deleteServiceRecord, type ServicePlan, type ServiceRecord } from '~/server/maintenance'
import {
  PLANNED_TYPES,
  computeService,
  resolvePlan,
  serviceTone,
  serviceOverdueKind,
  type PlanRow,
  type ServiceCompute,
  type ServiceType,
} from '~/lib/maintenance'
import { agencyToday } from '~/lib/tz'
import { LogServiceSheet } from '~/components/LogServiceSheet'
import { useI18n } from '~/lib/i18n'
import { Card, CardHeader, CardBody, Badge, Button, Input, cn } from '~/components/ui'

type T = (k: string, v?: Record<string, string | number>) => string

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  vidange: Droplet,
  courroie: Settings,
  freins: Gauge,
  pneus: Wrench,
  filtre: Wrench,
  autre: Wrench,
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

function dueText(c: ServiceCompute, t: T): string {
  if (c.status === 'unknown') return t('svc.notLogged')
  if (c.status === 'expired') {
    if (c.kmLeft != null && c.kmLeft <= 0) return t('svc.overdueByKm', { km: Math.abs(c.kmLeft).toLocaleString() })
    if (c.daysLeft != null && c.daysLeft <= 0) return t('svc.overdueByDays', { n: Math.abs(c.daysLeft) })
    return t('svc.overdue')
  }
  const parts: string[] = []
  if (c.kmLeft != null) parts.push(t('svc.kmLeft', { km: c.kmLeft.toLocaleString() }))
  if (c.etaDays != null) parts.push(t('svc.dueInDays', { n: c.etaDays }))
  else if (c.dueDate) parts.push(t('svc.dueDate', { date: format(new Date(`${c.dueDate}T00:00:00`), 'd MMM yyyy') }))
  return parts.join(' · ') || '—'
}

export function ServicePanel({
  vehicleId,
  mileage,
  avgKmPerDay = null,
  plans,
  records,
  onChanged,
}: {
  vehicleId: string
  mileage: number
  avgKmPerDay?: number | null
  plans: ServicePlan[]
  records: ServiceRecord[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const today = agencyToday()
  const [logOpen, setLogOpen] = useState(false)
  const [logType, setLogType] = useState<string>('vidange')
  const [km, setKm] = useState(String(mileage))
  const [savingKm, setSavingKm] = useState(false)

  const computed = useMemo(() => {
    const latest = new Map<string, ServiceRecord>()
    for (const r of records) if (!latest.has(r.type)) latest.set(r.type, r) // records already newest-first
    return PLANNED_TYPES.map((type: ServiceType) => {
      const plan = resolvePlan(type, vehicleId, plans as unknown as PlanRow[])
      const last = latest.get(type)
      const c = computeService({
        plan,
        lastKm: last?.odometer_km ?? null,
        lastDate: last?.performed_at ?? null,
        mileage,
        avgKmPerDay,
        today,
      })
      return { type, c }
    }).sort((a, b) => {
      const rank = { expired: 0, soon: 1, ok: 2, unknown: 3 } as const
      return rank[a.c.status] - rank[b.c.status]
    })
  }, [records, plans, vehicleId, mileage, avgKmPerDay, today])

  const totalSpend = useMemo(() => records.reduce((s, r) => s + (r.cost ?? 0), 0), [records])

  async function saveKm(e: React.FormEvent) {
    e.preventDefault()
    setSavingKm(true)
    try {
      await updateOdometer({ data: { vehicle_id: vehicleId, km: Number(km) } })
      toast.success(t('svc.kmUpdated'))
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setSavingKm(false)
    }
  }

  async function removeRecord(id: string) {
    try {
      await deleteServiceRecord({ data: { id } })
      toast.success(t('svc.deleted'))
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  function openLog(type: string) {
    setLogType(type)
    setLogOpen(true)
  }

  return (
    <Card>
      <CardHeader
        className="flex-wrap gap-y-2"
        title={
          <span className="flex items-center gap-2">
            <Wrench className="h-[18px] w-[18px] text-[var(--color-brand)]" />
            {t('svc.title')}
          </span>
        }
        action={
          <Button size="sm" onClick={() => openLog('vidange')}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('svc.logService')}</span>
            <span className="sm:hidden">{t('common.add') || 'Ajouter'}</span>
          </Button>
        }
      />
      <CardBody className="space-y-5">
        {/* Odometer + spend strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3">
          <form onSubmit={saveKm} className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--color-muted)]" />
            <Input
              type="number"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              min={0}
              className="h-9 w-28"
              aria-label={t('svc.odometer')}
            />
            <span className="text-xs text-[var(--color-muted)]">km</span>
            <Button type="submit" size="sm" variant="secondary" loading={savingKm}>
              {t('svc.updateKm')}
            </Button>
            {avgKmPerDay != null && (
              <span className="hidden text-xs text-[var(--color-faint)] sm:inline">
                · {t('svc.avgUsage', { rate: Math.round(avgKmPerDay) })}
              </span>
            )}
          </form>
          <div className="flex items-center gap-1.5 text-sm">
            <Coins className="h-4 w-4 text-[var(--color-faint)]" />
            <span className="text-[var(--color-muted)]">{t('svc.totalSpend')}:</span>
            <span className="font-bold tnum text-[var(--color-ink)]">{totalSpend.toLocaleString()} MAD</span>
          </div>
        </div>

        {/* Per-type schedule */}
        <div className="grid gap-3 sm:grid-cols-2">
          {computed.map(({ type, c }) => {
            const Icon = TYPE_ICON[type] ?? Wrench
            return (
              <div key={type} className="rounded-xl border border-[var(--color-line)] bg-white p-3.5 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2.5">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE[c.status])}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{t(`svc.type.${type}`)}</div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{dueText(c, t)}</div>
                  </div>
                  <Badge tone={serviceTone(c.status)}>
                    {c.status === 'expired'
                      ? (() => {
                          const k = serviceOverdueKind(type)
                          return k === 'inspect' ? t('si.overdueInspect') : k === 'replace' ? t('si.overdueReplace') : t('si.overdueBlock')
                        })()
                      : c.status === 'soon'
                        ? t('svc.dueNow')
                        : c.status === 'ok'
                          ? t('vd.condOk')
                          : '—'}
                  </Badge>
                </div>
                {c.status !== 'unknown' && (
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)] shadow-[inset_0_1px_2px_rgba(16,24,40,0.1)]">
                    <div className={cn('h-full rounded-full', BAR[c.status])} style={{ width: `${c.pct}%` }} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openLog(type)}
                  className="mt-2.5 text-xs font-semibold text-[var(--color-brand)] hover:underline"
                >
                  {c.status === 'unknown' ? t('svc.setBaseline') : t('svc.markDone')}
                </button>
              </div>
            )
          })}
        </div>

        {/* History timeline */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">{t('svc.history')}</h4>
          {records.length === 0 ? (
            <p className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-3 py-3 text-xs text-[var(--color-muted)]">
              {t('svc.noHistory')}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {records.map((r) => (
                <li
                  key={r.id}
                  className="group flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-muted)]">
                    {(() => {
                      const Icon = TYPE_ICON[r.type] ?? Wrench
                      return <Icon className="h-4 w-4" />
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                      {t(`svc.type.${r.type}`)}
                      <span className="text-xs font-normal text-[var(--color-faint)]">
                        {format(new Date(`${r.performed_at}T00:00:00`), 'd MMM yyyy')}
                      </span>
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted)] tnum">
                      {[
                        r.odometer_km != null ? `${r.odometer_km.toLocaleString()} km` : null,
                        r.cost != null ? `${r.cost.toLocaleString()} MAD` : null,
                        r.garage,
                        r.notes,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRecord(r.id)}
                    aria-label={t('common.delete')}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--color-faint)] opacity-0 transition hover:bg-red-50 hover:text-[var(--color-danger)] group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>

      <LogServiceSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        vehicleId={vehicleId}
        defaultType={logType}
        defaultMileage={mileage}
        onDone={onChanged}
      />
    </Card>
  )
}
