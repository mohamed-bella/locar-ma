import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Vehicle } from '~/server/fleet'
import { setVehicleExpiry } from '~/server/fleet'
import { logService, updateOdometer, type ServicePlan, type ServiceRecord } from '~/server/maintenance'
import type { AlertRule } from '~/server/alertRules'
import type { DocumentType } from '~/server/documentTypes'
import {
  PLANNED_TYPES,
  computeService,
  resolvePlan,
  strategyFor,
  serviceOverdueKind,
  type PlanRow,
} from '~/lib/maintenance'
import { daysUntil, condStatus, thresholdFor, type CondStatus } from '~/lib/fleet'
import { allTrackers, trackerDate } from '~/lib/tracking'
import { agencyToday } from '~/lib/tz'
import { useI18n } from '~/lib/i18n'
import { Modal, Button, Input, Badge, cn } from '~/components/ui'
import { DateField } from '~/components/ui/DateField'
import { PngIcon, StatusDot, legalIconPath, serviceIconPath } from './Icon'

const BLUE = '#1d5b8d'

type Tile =
  | { kind: 'odometer'; label: string; icon: string; status: null }
  | { kind: 'legal'; code: string; label: string; icon: string; status: CondStatus; date: string | null; daysLeft: number | null }
  | { kind: 'service'; type: string; label: string; icon: string; status: CondStatus; last: ServiceRecord | undefined; compute: ReturnType<typeof computeService> }

// Old-school vehicle "cockpit": a blue identity strip, then a grid of icon
// tiles — one per thing tracked on the car (papers + mechanical). Tap a tile to
// see current values and update that one item; every item is handled its own way.
export function SuiviBoard({
  vehicle,
  servicePlans,
  serviceRecords,
  alertRules,
  documentTypes,
  onChanged,
}: {
  vehicle: Vehicle
  servicePlans: ServicePlan[]
  serviceRecords: ServiceRecord[]
  alertRules: AlertRule[]
  documentTypes: DocumentType[]
  onChanged: () => void
}) {
  const { t } = useI18n()
  const today = agencyToday()
  const [open, setOpen] = useState<Tile | null>(null)

  const latestByType = useMemo(() => {
    const m = new Map<string, ServiceRecord>()
    for (const r of serviceRecords) if (!m.has(r.type)) m.set(r.type, r) // newest-first
    return m
  }, [serviceRecords])

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [{ kind: 'odometer', label: t('svc.odometer'), icon: 'check/kilometrage', status: null }]

    for (const tr of allTrackers(documentTypes)) {
      const date = trackerDate(vehicle, tr)
      const daysLeft = daysUntil(date)
      out.push({
        kind: 'legal',
        code: tr.code,
        label: tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code),
        icon: legalIconPath(tr.code),
        status: condStatus(daysLeft, thresholdFor(tr.field!, alertRules)),
        date,
        daysLeft,
      })
    }

    for (const type of PLANNED_TYPES) {
      const plan = resolvePlan(type, vehicle.id, servicePlans as unknown as PlanRow[])
      const last = latestByType.get(type)
      const compute = computeService({
        plan,
        lastKm: last?.odometer_km ?? null,
        lastDate: last?.performed_at ?? null,
        mileage: vehicle.mileage_current,
        avgKmPerDay: null,
        today,
      })
      out.push({ kind: 'service', type, label: t(`svc.type.${type}`), icon: serviceIconPath(type), status: compute.status, last, compute })
    }
    return out
  }, [vehicle, documentTypes, alertRules, servicePlans, latestByType, today, t])

  const title = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || vehicle.plate

  return (
    <div className="border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
      {/* Blue identity strip */}
      <div className="flex items-center gap-3 p-3" style={{ backgroundColor: BLUE }}>
        {vehicle.image_urls[0] ? (
          <img
            src={vehicle.image_urls[0]}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-20 shrink-0 border border-white/20 object-cover"
          />
        ) : (
          <span className="flex h-14 w-20 shrink-0 items-center justify-center bg-white/10 text-xl font-bold text-white/80">
            {title[0]?.toUpperCase() ?? '?'}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-bold uppercase tracking-wide text-white">{title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-white/85">
            <span className="border border-white/30 px-1.5 py-0.5 font-mono font-bold tracking-wider">{vehicle.plate}</span>
            <span className="tnum">{vehicle.mileage_current.toLocaleString()} km</span>
          </div>
        </div>
      </div>

      {/* Icon tile grid on blue */}
      <div className="grid grid-cols-3 gap-px sm:grid-cols-4 md:grid-cols-6" style={{ backgroundColor: BLUE }}>
        {tiles.map((tile) => (
          <button
            key={tile.kind === 'legal' ? `l-${tile.code}` : tile.kind === 'service' ? `s-${tile.type}` : 'odo'}
            onClick={() => setOpen(tile)}
            className="group relative flex flex-col items-center gap-1.5 bg-white px-2 py-3.5 text-center transition hover:bg-[var(--color-surface-muted)]"
          >
            {tile.status && (
              <span className="absolute end-1.5 top-1.5">
                <StatusDot status={tile.status} />
              </span>
            )}
            <PngIcon path={tile.icon} size={34} />
            <span className="text-[11px] font-semibold leading-tight text-[var(--color-ink-soft)]">{tile.label}</span>
          </button>
        ))}
      </div>

      {open && (
        <ManageModal tile={open} vehicle={vehicle} onClose={() => setOpen(null)} onChanged={onChanged} records={serviceRecords} />
      )}
    </div>
  )
}

// ── Per-item manage popup ───────────────────────────────
function ManageModal({
  tile,
  vehicle,
  onClose,
  onChanged,
  records,
}: {
  tile: Tile
  vehicle: Vehicle
  onClose: () => void
  onChanged: () => void
  records: ServiceRecord[]
}) {
  const { t } = useI18n()
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={tile.label}>
      <div className="flex items-center gap-3 border-y border-[var(--color-line)] bg-[var(--color-surface-muted)] px-3 py-2.5">
        <PngIcon path={tile.icon} size={30} />
        {tile.status && (
          <Badge tone={tile.status === 'ok' ? 'ok' : tile.status === 'soon' ? 'warn' : tile.status === 'expired' ? 'danger' : 'neutral'}>
            {tile.status === 'ok' ? t('vd.condOk') : tile.status === 'soon' ? t('vd.condSoon') : tile.status === 'expired' ? t('vd.condExpired') : t('vd.condUnknown')}
          </Badge>
        )}
      </div>

      {tile.kind === 'odometer' && <OdometerForm vehicle={vehicle} onDone={() => { onChanged(); onClose() }} />}
      {tile.kind === 'legal' && <LegalForm vehicle={vehicle} tile={tile} onDone={() => { onChanged(); onClose() }} />}
      {tile.kind === 'service' && <ServiceForm vehicle={vehicle} tile={tile} records={records} onDone={() => { onChanged(); onClose() }} />}
    </Modal>
  )
}

// Old-school label|value rows.
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-line)] py-1.5 text-sm last:border-b-0">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-semibold tnum text-[var(--color-ink)]">{value}</span>
    </div>
  )
}

function useBusy() {
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

// ── Odometer: just a number ──
function OdometerForm({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const km = Number(new FormData(e.currentTarget).get('km'))
        run(async () => {
          await updateOdometer({ data: { vehicle_id: vehicle.id, km } })
          onDone()
        }, t('svc.kmUpdated'))
      }}
    >
      <div className="border border-[var(--color-line)] px-3 py-1">
        <Row label={t('vd.currentKm')} value={`${vehicle.mileage_current.toLocaleString()} km`} />
      </div>
      <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('svc.odometer')}</label>
      <Input type="number" name="km" min={0} defaultValue={vehicle.mileage_current} inputMode="numeric" required />
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>{t('svc.updateKm')}</Button>
      </div>
    </form>
  )
}

// ── Legal paper: a single expiry date ──
function LegalForm({ vehicle, tile, onDone }: { vehicle: Vehicle; tile: Extract<Tile, { kind: 'legal' }>; onDone: () => void }) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const date = String(new FormData(e.currentTarget).get('date') ?? '')
        run(async () => {
          await setVehicleExpiry({ data: { vehicle_id: vehicle.id, code: tile.code, date: date || null } })
          onDone()
        }, t('common.saved'))
      }}
    >
      <div className="border border-[var(--color-line)] px-3 py-1">
        <Row label={t('si.expiry')} value={tile.date ? format(new Date(`${tile.date}T00:00:00`), 'd MMM yyyy') : '—'} />
        <Row label={t('common.days')} value={tile.daysLeft != null ? (tile.daysLeft < 0 ? t('vd.overdue', { n: -tile.daysLeft }) : t('vd.daysLeft', { n: tile.daysLeft })) : '—'} />
      </div>
      <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('si.newDate')}</label>
      <DateField name="date" defaultValue={tile.date ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>{t('common.save')}</Button>
      </div>
    </form>
  )
}

// ── Mechanical service: log a done event (fields adapt to the type's axes) ──
function ServiceForm({
  vehicle,
  tile,
  records,
  onDone,
}: {
  vehicle: Vehicle
  tile: Extract<Tile, { kind: 'service' }>
  records: ServiceRecord[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  const hasKm = strategyFor(tile.type).axes.includes('km')
  const c = tile.compute
  const history = records.filter((r) => r.type === tile.type).slice(0, 4)
  const kind = serviceOverdueKind(tile.type)

  return (
    <div className="mt-4 space-y-4">
      {/* Current */}
      <div className="border border-[var(--color-line)] px-3 py-1">
        <Row label={t('vd.lastServiceKm')} value={c.lastKm != null ? `${c.lastKm.toLocaleString()} km` : c.lastDate ? format(new Date(`${c.lastDate}T00:00:00`), 'd MMM yyyy') : '—'} />
        {hasKm && <Row label={t('vd.nextServiceKm')} value={c.dueKm != null ? `${c.dueKm.toLocaleString()} km` : '—'} />}
        <Row label={t('svc.dueNow')} value={c.status === 'expired' ? (kind === 'inspect' ? t('si.overdueInspect') : kind === 'replace' ? t('si.overdueReplace') : t('si.overdueBlock')) : c.kmLeft != null ? t('svc.kmLeft', { km: c.kmLeft.toLocaleString() }) : c.etaDays != null ? t('svc.dueInDays', { n: c.etaDays }) : '—'} />
      </div>

      {/* Progress bar (old-school flat) */}
      {c.status !== 'unknown' && (
        <div className="h-3 border border-[var(--color-line-strong)] bg-white">
          <div className={cn('h-full', c.status === 'expired' ? 'bg-[var(--color-danger)]' : c.status === 'soon' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-ok)]')} style={{ width: `${c.pct}%` }} />
        </div>
      )}

      {/* Log form — km only for km-axis types (hidden for battery) */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          run(async () => {
            await logService({
              data: {
                vehicle_id: vehicle.id,
                type: tile.type,
                performed_at: String(fd.get('performed_at')),
                odometer_km: hasKm && fd.get('odometer_km') ? Number(fd.get('odometer_km')) : undefined,
                cost: fd.get('cost') ? Number(fd.get('cost')) : undefined,
                garage: String(fd.get('garage') ?? '') || undefined,
              },
            })
            onDone()
          }, t('svc.saved'))
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('svc.date')}</label>
            <Input type="date" name="performed_at" required defaultValue={agencyToday()} />
          </div>
          {hasKm && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('svc.odometer')}</label>
              <Input type="number" name="odometer_km" min={0} inputMode="numeric" defaultValue={vehicle.mileage_current} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('svc.cost')}</label>
            <Input type="number" name="cost" min={0} inputMode="numeric" placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-muted)]">{t('svc.garage')}</label>
            <Input name="garage" placeholder="—" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>{t('svc.markDone')}</Button>
        </div>
      </form>

      {/* Old-school history table */}
      {history.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">{t('svc.history')}</div>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-line)] last:border-b-0">
                  <td className="py-1.5 text-[var(--color-muted)]">{format(new Date(`${r.performed_at}T00:00:00`), 'd MMM yyyy')}</td>
                  <td className="py-1.5 text-end tnum text-[var(--color-ink-soft)]">{r.odometer_km != null ? `${r.odometer_km.toLocaleString()} km` : ''}</td>
                  <td className="py-1.5 text-end tnum text-[var(--color-ink-soft)]">{r.cost != null ? `${r.cost.toLocaleString()} MAD` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
