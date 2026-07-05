import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CalendarRange, Ban, Trash2, FileText, ChevronDown, Car, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createReservation,
  updateReservation,
  deleteReservation,
  createBlock,
  checkVehicleCompliance,
  type Reservation,
  type ComplianceIssue,
} from '~/server/reservations'
import { createContractFromReservation } from '~/server/contracts'
import { RESERVATION_STATUSES } from '~/lib/schemas'
import { SlideOver, Button, Field, Input, Select, Textarea, cn } from '~/components/ui'
import { NumberField } from '~/components/ui/NumberField'
import { DateRangeField } from '~/components/ui/DateRangeField'
import { ClientSelect } from '~/components/ClientSelect'
import { useI18n } from '~/lib/i18n'

export type VehicleOption = { id: string; plate: string; brand: string | null; daily_rate: number; image_url?: string | null; status?: string }

type Initial = {
  id?: string
  vehicle_id?: string
  client_id?: string | null
  client_name?: string | null
  date_start?: string
  date_end?: string
  daily_rate_snap?: number | null
  status?: string
  pickup_location?: string | null
  dropoff_location?: string | null
  notes?: string | null
  is_block?: boolean
}

function daysBetween(a?: string, b?: string) {
  if (!a || !b) return 0
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}

export function ReservationDrawer({
  open,
  onOpenChange,
  vehicles,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vehicles: VehicleOption[]
  initial: Initial
  onSaved: () => void
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const isEdit = Boolean(initial.id)
  const [kind, setKind] = useState<'reservation' | 'block'>(initial.is_block ? 'block' : 'reservation')
  const [busy, setBusy] = useState(false)

  async function startRental() {
    if (!initial.id) return
    setBusy(true)
    try {
      const { id } = await createContractFromReservation({ data: { reservation_id: initial.id } })
      onOpenChange(false)
      onSaved()
      await navigate({ to: '/contracts/$contractId', params: { contractId: id } })
    } catch (err: any) {
      toast.error(err?.message ?? t('res.couldNotStart'))
    } finally {
      setBusy(false)
    }
  }

  const defVehicle = vehicles.find((v) => v.id === initial.vehicle_id) ?? vehicles[0]
  const [start, setStart] = useState(initial.date_start ?? '')
  const [end, setEnd] = useState(initial.date_end ?? '')
  const [rate, setRate] = useState<number>(initial.daily_rate_snap ?? defVehicle?.daily_rate ?? 0)

  const [isOpen, setIsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(initial.vehicle_id ?? vehicles[0]?.id ?? '')
  const selectedVehicle = vehicles.find((v) => v.id === selectedId) || vehicles[0]

  useEffect(() => {
    if (open) {
      // Reset per-entry state each time the drawer opens with a new target,
      // otherwise the previous entry's mode/vehicle leaks in (e.g. a block
      // shown with reservation fields).
      setKind(initial.is_block ? 'block' : 'reservation')
      setSelectedId(initial.vehicle_id ?? vehicles[0]?.id ?? '')
      const currentVehicle = vehicles.find((v) => v.id === (initial.vehicle_id ?? vehicles[0]?.id ?? ''))
      if (currentVehicle) {
        setRate(initial.daily_rate_snap ?? currentVehicle.daily_rate)
      }
    }
  }, [initial.vehicle_id, initial.daily_rate_snap, initial.is_block, open, vehicles])

  const days = daysBetween(start, end)
  const total = rate * days

  // ── Compliance guard ──
  const [issues, setIssues] = useState<ComplianceIssue[]>([])
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const [ack, setAck] = useState(false)

  useEffect(() => {
    // Only guard real reservations with a vehicle + return date.
    if (kind !== 'reservation' || !open || !selectedId || !end) {
      setIssues([])
      setChecked(false)
      return
    }
    let cancelled = false
    setChecking(true)
    setAck(false)
    const handle = setTimeout(async () => {
      try {
        const res = await checkVehicleCompliance({ data: { vehicle_id: selectedId, date_end: end } })
        if (!cancelled) {
          setIssues(res)
          setChecked(true)
        }
      } catch {
        if (!cancelled) setIssues([])
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [kind, open, selectedId, end])

  const hasBlockingIssues = issues.length > 0
  const worstSeverity = issues.some((i) => i.severity === 'expired') ? 'expired' : 'lapses'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const vehicle_id = String(fd.get('vehicle_id') ?? '')
    const date_start = String(fd.get('date_start') ?? '')
    const date_end = String(fd.get('date_end') ?? '')
    if (!vehicle_id || !date_start || !date_end) {
      toast.error(t('res.vehicleDatesRequired'))
      return
    }
    // Compliance guard: require explicit override when papers/service lapse.
    if (kind === 'reservation' && hasBlockingIssues && !ack) {
      toast.error(t('res.complianceBlock'))
      return
    }
    setBusy(true)
    try {
      if (kind === 'block') {
        await createBlock({
          data: { vehicle_id, date_start, date_end, reason: String(fd.get('notes') ?? '') || undefined },
        })
        toast.success(t('res.datesBlocked'))
      } else {
        const payload = {
          vehicle_id,
          client_id: String(fd.get('client_id') ?? '') || undefined,
          date_start,
          date_end,
          pickup_location: String(fd.get('pickup_location') ?? '') || undefined,
          dropoff_location: String(fd.get('dropoff_location') ?? '') || undefined,
          daily_rate_snap: rate,
          status: String(fd.get('status') ?? 'confirmed') as any,
          notes: String(fd.get('notes') ?? '') || undefined,
        }
        if (isEdit) {
          await updateReservation({ data: { ...payload, id: initial.id! } })
          toast.success(t('res.updated'))
        } else {
          await createReservation({ data: payload })
          toast.success(t('res.created'))
        }
      }
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      toast.error(err?.message ?? t('res.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial.id) return
    if (!confirm(t('res.deleteEntry'))) return
    setBusy(true)
    try {
      await deleteReservation({ data: { id: initial.id } })
      toast.success(t('common.deleted'))
      onOpenChange(false)
      onSaved()
    } catch (err: any) {
      toast.error(err?.message ?? t('res.couldNotDelete'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? (initial.is_block ? t('res.blockedDates') : t('res.reservationWord')) : t('res.new')}
      description={defVehicle ? `${defVehicle.plate}${defVehicle.brand ? ` · ${defVehicle.brand}` : ''}` : undefined}
    >
      <form onSubmit={submit} className="space-y-5">
        {!isEdit && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-surface-muted)] p-1">
            <Toggle active={kind === 'reservation'} onClick={() => setKind('reservation')} icon={CalendarRange}>
              {t('res.reservationWord')}
            </Toggle>
            <Toggle active={kind === 'block'} onClick={() => setKind('block')} icon={Ban}>
              {t('res.blockDates')}
            </Toggle>
          </div>
        )}

        {isEdit && !initial.is_block && (
          <button
            type="button"
            onClick={startRental}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-brand)] transition hover:bg-[var(--color-brand)] hover:text-white"
          >
            <FileText className="h-4 w-4" /> {t('res.startRentalGenerate')}
          </button>
        )}

        <Field label={t('common.vehicle')} required>
          <div className="relative">
            {/* Hidden Input to hook into standard Form submit */}
            <input type="hidden" name="vehicle_id" value={selectedId} />

            {/* Dropdown trigger button */}
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-left shadow-sm hover:border-[var(--color-line-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-ring)]"
            >
              {selectedVehicle ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-10 shrink-0 overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-surface-muted)] flex items-center justify-center">
                    {selectedVehicle.image_url ? (
                      <img src={selectedVehicle.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Car className="h-4 w-4 text-[var(--color-faint)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-[var(--color-ink)] truncate block text-left">
                      {selectedVehicle.plate}
                    </span>
                    {selectedVehicle.brand && (
                      <span className="text-[11px] text-[var(--color-muted)] truncate block -mt-0.5 text-left">
                        {selectedVehicle.brand}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-sm text-[var(--color-muted)]">{t('res.selectVehicle')}</span>
              )}
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>

            {/* Dropdown Options List */}
            {isOpen && (
              <>
                {/* Backdrop overlay to click away & close */}
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                {/* Options overlay */}
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-white shadow-lg py-1">
                  {vehicles.map((v) => {
                    const active = v.id === selectedId
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(v.id)
                          if (!isEdit) {
                            setRate(v.daily_rate)
                          }
                          setIsOpen(false)
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors focus:outline-none',
                          active
                            ? 'bg-[var(--color-brand-soft)]/50 border-l-2 border-[var(--color-brand)]'
                            : 'hover:bg-[var(--color-surface-muted)]',
                        )}
                      >
                        <div className="h-7 w-10 shrink-0 overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-surface-muted)] flex items-center justify-center">
                          {v.image_url ? (
                            <img src={v.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Car className="h-4 w-4 text-[var(--color-faint)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className={cn(
                            'block text-sm truncate',
                            active ? 'font-bold text-[var(--color-ink)]' : 'font-semibold text-[var(--color-ink-soft)]'
                          )}>
                            {v.plate}
                          </span>
                          {v.brand && (
                            <span className="block text-[11px] text-[var(--color-muted)] truncate -mt-0.5">
                              {v.brand}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </Field>

        <Field label={t('common.dates')} required>
          <DateRangeField
            initialStart={initial.date_start}
            initialEnd={initial.date_end}
            onChange={({ start: s, end: e }) => {
              setStart(s)
              setEnd(e)
            }}
          />
        </Field>

        {kind === 'reservation' && (
          <ComplianceBanner
            checking={checking}
            checked={checked}
            issues={issues}
            severity={worstSeverity}
            ack={ack}
            onAck={setAck}
          />
        )}

        {kind === 'reservation' ? (
          <>
            <Field label={t('common.client')}>
              <ClientSelect initialId={initial.client_id} initialName={initial.client_name} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('res.dailyRate')}>
                <NumberField
                  name="daily_rate_snap"
                  defaultValue={rate}
                  suffix=" MAD"
                  onValueChange={(v) => setRate(Number(v) || 0)}
                />
              </Field>
              <Field label={t('common.status')}>
                <Select name="status" defaultValue={initial.status ?? 'confirmed'}>
                  {RESERVATION_STATUSES.filter((s) => s !== 'cancelled').map((s) => (
                    <option key={s} value={s}>
                      {t(`rstatus.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('res.pickup')}>
                <Input name="pickup_location" defaultValue={initial.pickup_location ?? ''} placeholder={t('res.airport')} />
              </Field>
              <Field label={t('res.dropoff')}>
                <Input name="dropoff_location" defaultValue={initial.dropoff_location ?? ''} placeholder={t('res.agency')} />
              </Field>
            </div>
            <Field label={t('common.notes')}>
              <Textarea name="notes" defaultValue={initial.notes ?? ''} rows={2} />
            </Field>

            <div className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-3">
              <div className="text-sm text-[var(--color-muted)]">
                {days} {days === 1 ? t('common.day') : t('common.days')} × {rate.toLocaleString()} MAD
              </div>
              <div className="text-lg font-bold tnum text-[var(--color-ink)]">
                {total.toLocaleString()} MAD
              </div>
            </div>
          </>
        ) : (
          <Field label={t('res.reason')}>
            <Input name="notes" defaultValue={initial.notes ?? ''} placeholder={t('res.reasonPlaceholder')} />
          </Field>
        )}

        <div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-2 border-t border-[var(--color-line)] bg-white/90 px-5 py-3 backdrop-blur">
          {isEdit ? (
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-danger)] hover:underline"
            >
              <Trash2 className="h-4 w-4" /> {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={kind === 'reservation' && hasBlockingIssues && !ack}
            >
              {isEdit ? t('common.save') : kind === 'block' ? t('res.blockDates') : t('res.create')}
            </Button>
          </div>
        </div>
      </form>
    </SlideOver>
  )
}

const DOC_KEY: Record<string, string> = {
  insurance: 'vd.insurance',
  vignette: 'vd.vignette',
  visite: 'vd.visiteTech',
  oil: 'vd.oilChange',
}

function ComplianceBanner({
  checking,
  checked,
  issues,
  severity,
  ack,
  onAck,
}: {
  checking: boolean
  checked: boolean
  issues: ComplianceIssue[]
  severity: 'expired' | 'lapses'
  ack: boolean
  onAck: (v: boolean) => void
}) {
  const { t } = useI18n()

  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-xs font-medium text-[var(--color-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('res.compChecking')}
      </div>
    )
  }

  if (checked && issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-ok)]/30 bg-[var(--color-ok-soft)]/50 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-ok)]">
        <ShieldCheck className="h-4 w-4" /> {t('res.compClear')}
      </div>
    )
  }

  if (issues.length === 0) return null

  const danger = severity === 'expired'
  const text = (i: ComplianceIssue) => {
    const name = i.label ?? t(DOC_KEY[i.code] ?? i.code)
    if (i.code === 'oil') return i.severity === 'expired' ? t('res.compOilOverdue') : t('res.compOilDue')
    return i.severity === 'expired'
      ? t('res.compExpired', { doc: name, date: i.date ?? '' })
      : t('res.compLapses', { doc: name, date: i.date ?? '' })
  }

  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3',
        danger
          ? 'border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]/50'
          : 'border-amber-400/40 bg-amber-50',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-bold',
          danger ? 'text-[var(--color-danger)]' : 'text-amber-700',
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" /> {t('res.compTitle')}
      </div>
      <ul className="mt-1.5 space-y-1 pl-6 text-xs text-[var(--color-ink-soft)]">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="list-disc">
            {text(i)}
          </li>
        ))}
      </ul>
      <label className="mt-2.5 flex cursor-pointer items-center gap-2 border-t border-black/5 pt-2.5 text-xs font-semibold text-[var(--color-ink)]">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => onAck(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-line-strong)] accent-[var(--color-brand)]"
        />
        {t('res.compAck')}
      </label>
    </div>
  )
}

function Toggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
        active
          ? 'bg-white text-[var(--color-ink)] shadow-sm'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  )
}
