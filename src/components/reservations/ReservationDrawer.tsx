import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarRange,
  Ban,
  Trash2,
  FileText,
  Car,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Search,
  User,
  Lock,
  UserPlus,
  Clock,
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createReservation,
  updateReservation,
  deleteReservation,
  createBlock,
  checkAvailability,
  checkVehicleCompliance,
  type Reservation,
  type AvailabilityRow,
  type ComplianceIssue,
} from '~/server/reservations'
import { createContractFromReservation } from '~/server/contracts'
import { RESERVATION_STATUSES } from '~/lib/schemas'
import { Modal, Button, Field, Input, Select, Textarea, cn } from '~/components/ui'
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
  const [currentStep, setCurrentStep] = useState(0)
  const [busy, setBusy] = useState(false)

  async function startRental() {
    if (!initial.id) return
    setBusy(true)
    try {
      const result = await createContractFromReservation({ data: { reservation_id: initial.id } })
      if (!result?.id) throw new Error(result?.error ?? 'Contract creation failed')
      onOpenChange(false)
      onSaved()
      await navigate({ to: '/reservations/$reservationId', params: { reservationId: initial.id } })
    } catch (err: any) {
      toast.error(err?.message ?? t('res.couldNotStart'))
    } finally {
      setBusy(false)
    }
  }

  const defVehicle = vehicles.find((v) => v.id === initial.vehicle_id)
  const [start, setStart] = useState(initial.date_start ?? '')
  const [end, setEnd] = useState(initial.date_end ?? '')
  const [rate, setRate] = useState<number>(initial.daily_rate_snap ?? defVehicle?.daily_rate ?? 0)
  const [selectedId, setSelectedId] = useState(initial.vehicle_id ?? '')
  const selectedVehicle = vehicles.find((v) => v.id === selectedId)
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[] | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState(false)

  useEffect(() => {
    if (open) {
      setKind(initial.is_block ? 'block' : 'reservation')
      setCurrentStep(0)
      setStart(initial.date_start ?? '')
      setEnd(initial.date_end ?? '')
      setSelectedId(initial.vehicle_id ?? '')
      const cv = vehicles.find((v) => v.id === initial.vehicle_id)
      setRate(cv ? (initial.daily_rate_snap ?? cv.daily_rate) : 0)
    }
  }, [initial.vehicle_id, initial.daily_rate_snap, initial.is_block, open, vehicles])

  const days = daysBetween(start, end)
  const total = rate * days
  const isBlock = kind === 'block'

  const reservationSteps = [
    { label: 'Période', icon: CalendarRange },
    { label: 'Voiture', icon: Car },
    { label: 'Client', icon: User },
    { label: 'Confirmer', icon: CheckCircle2 },
  ]
  const blockSteps = [
    { label: 'Période', icon: CalendarRange },
    { label: 'Voiture', icon: Car },
    { label: 'Motif', icon: Ban },
  ]
  const steps = isBlock ? blockSteps : reservationSteps

  function goNext() {
    if (currentStep === 0 && (!start || !end)) { toast.error(t('res.vehicleDatesRequired')); return }
    if (currentStep === 1 && !selectedId) { toast.error(t('res.selectVehicle')); return }
    setCurrentStep((s) => Math.min(steps.length - 1, s + 1))
  }

  function goToStep(step: number) {
    if (step <= currentStep) { setCurrentStep(step); return }
    if (!start || !end) { toast.error('Choisissez les dates.'); return }
    if (step > 1 && !selectedId) { toast.error('Choisissez une voiture.'); return }
    setCurrentStep(step)
  }

  // ── Availability ──
  useEffect(() => {
    if (!open || !start || !end) { setAvailabilityRows(null); return }
    let cancelled = false
    setAvailabilityLoading(true); setAvailabilityError(false)
    const h = setTimeout(async () => {
      try { const r = await checkAvailability({ data: { from: start, to: end } }); if (!cancelled) setAvailabilityRows(r) }
      catch { if (!cancelled) { setAvailabilityRows(null); setAvailabilityError(true) } }
      finally { if (!cancelled) setAvailabilityLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(h) }
  }, [open, start, end])

  useEffect(() => {
    if (isEdit || !selectedId || !availabilityRows) return
    const r = availabilityRows.find((row) => row.vehicle.id === selectedId)
    if (r && !r.available) { setSelectedId(''); setRate(0); toast.info('Voiture plus disponible.') }
  }, [availabilityRows, isEdit, selectedId])

  // ── Compliance ──
  const [issues, setIssues] = useState<ComplianceIssue[]>([])
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const [ack, setAck] = useState(false)

  useEffect(() => {
    if (isBlock || !open || !selectedId || !end) { setIssues([]); setChecked(false); return }
    let cancelled = false; setChecking(true); setAck(false)
    const h = setTimeout(async () => {
      try { const r = await checkVehicleCompliance({ data: { vehicle_id: selectedId, date_end: end } }); if (!cancelled) { setIssues(r); setChecked(true) } }
      catch { if (!cancelled) setIssues([]) }
      finally { if (!cancelled) setChecking(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(h) }
  }, [isBlock, open, selectedId, end])

  const hasBlockingIssues = issues.length > 0
  const worstSeverity = issues.some((i) => i.severity === 'expired') ? 'expired' : 'lapses'

  const formRef = { current: null as HTMLFormElement | null }

  async function doSubmit() {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const vehicle_id = String(fd.get('vehicle_id') ?? '')
    const date_start = String(fd.get('date_start') ?? '')
    const date_end = String(fd.get('date_end') ?? '')
    if (!vehicle_id || !date_start || !date_end) { toast.error(t('res.vehicleDatesRequired')); return }
    if (!isBlock && hasBlockingIssues && !ack) { toast.error(t('res.complianceBlock')); return }
    setBusy(true)
    try {
      if (isBlock) {
        await createBlock({ data: { vehicle_id, date_start, date_end, reason: String(fd.get('notes') ?? '') || undefined } })
        toast.success(t('res.datesBlocked'))
      } else {
        const payload = {
          vehicle_id, client_id: String(fd.get('client_id') ?? '') || undefined,
          date_start, date_end,
          pickup_location: String(fd.get('pickup_location') ?? '') || undefined,
          dropoff_location: String(fd.get('dropoff_location') ?? '') || undefined,
          daily_rate_snap: rate,
          status: String(fd.get('status') ?? 'confirmed') as any,
          notes: String(fd.get('notes') ?? '') || undefined,
        }
        if (isEdit) { await updateReservation({ data: { ...payload, id: initial.id! } }); toast.success(t('res.updated')) }
        else { await createReservation({ data: payload }); toast.success(t('res.created')) }
      }
      onOpenChange(false); onSaved()
    } catch (err: any) { toast.error(err?.message ?? t('res.couldNotSave')) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!initial.id) return
    if (!confirm(t('res.deleteEntry'))) return
    setBusy(true)
    try { await deleteReservation({ data: { id: initial.id } }); toast.success(t('common.deleted')); onOpenChange(false); onSaved() }
    catch (err: any) { toast.error(err?.message ?? t('res.couldNotDelete')) }
    finally { setBusy(false) }
  }

  const accent = isBlock ? { bg: 'bg-red-600', bgSoft: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', ring: 'ring-red-500/20' } : { bg: 'bg-[#1d5b8d]', bgSoft: 'bg-blue-50', text: 'text-[#1d5b8d]', border: 'border-[#1d5b8d]', ring: 'ring-[#1d5b8d]/20' }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? (initial.is_block ? t('res.blockedDates') : t('res.reservationWord')) : t('res.new')}
      description={defVehicle ? `${defVehicle.plate}${defVehicle.brand ? ` · ${defVehicle.brand}` : ''}` : undefined}
      size="lg"
    >
      <form ref={(el) => { formRef.current = el }} onSubmit={(e) => e.preventDefault()} className="flex h-full min-h-0 flex-col">
        {/* ── Step bar ── */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-7">
          <div className="mx-auto flex max-w-[600px] items-center">
            {steps.map((step, i) => {
              const active = i === currentStep
              const done = i < currentStep
              return (
                <div key={step.label} className="flex flex-1 items-center">
                  {i > 0 && <div className={cn('h-[2px] flex-1', done ? accent.bg : 'bg-slate-200')} />}
                  <button type="button" onClick={() => goToStep(i)} className="flex flex-col items-center gap-1">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all',
                      active ? `${accent.bg} text-white shadow-md` : done ? `${accent.bg} text-white` : 'bg-slate-100 text-slate-400',
                    )}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={cn('hidden text-[10px] font-bold uppercase tracking-wide sm:block', active ? accent.text : done ? 'text-slate-600' : 'text-slate-400')}>
                      {step.label}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-5">

          {/* ═══ STEP 0 — Dates ═══ */}
          <section hidden={currentStep !== 0} className="mx-auto max-w-[640px]">
            {/* Kind cards — big, visual, color-coded */}
            {!isEdit && (
              <div className="mb-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setKind('reservation'); setCurrentStep(0) }}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition',
                    kind === 'reservation'
                      ? 'border-[#1d5b8d] bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}>
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', kind === 'reservation' ? 'bg-[#1d5b8d] text-white' : 'bg-slate-100 text-slate-400')}>
                    <CalendarRange className="h-6 w-6" />
                  </div>
                  <span className={cn('text-sm font-bold', kind === 'reservation' ? 'text-[#1d5b8d]' : 'text-slate-600')}>Réservation</span>
                  <span className="text-[11px] text-slate-400">Louer une voiture</span>
                </button>
                <button type="button" onClick={() => { setKind('block'); setCurrentStep(0) }}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition',
                    kind === 'block'
                      ? 'border-red-400 bg-red-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}>
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', kind === 'block' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400')}>
                    <Ban className="h-6 w-6" />
                  </div>
                  <span className={cn('text-sm font-bold', kind === 'block' ? 'text-red-600' : 'text-slate-600')}>Bloquer</span>
                  <span className="text-[11px] text-slate-400">Entretien, panne...</span>
                </button>
              </div>
            )}

            <DateRangeField
              initialStart={initial.date_start}
              initialEnd={initial.date_end}
              onChange={({ start: s, end: e }) => { setStart(s); setEnd(e) }}
            />

            {/* Duration indicator */}
            {days > 0 && (
              <div className={cn('mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold', isBlock ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-[#1d5b8d]')}>
                <Clock className="h-4 w-4" />
                {days} jour{days > 1 ? 's' : ''} · {fmtShort(start)} → {fmtShort(end)}
              </div>
            )}

            <div className={cn('mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs', isBlock ? 'bg-red-50/60 text-red-600' : 'bg-slate-50 text-slate-500')}>
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {isBlock ? 'La voiture sera retirée du planning.' : 'Les voitures occupées seront écartées.'}
            </div>
          </section>

          {/* ═══ STEP 1 — Vehicle ═══ */}
          <section hidden={currentStep !== 1} className="mx-auto max-w-[880px]">
            <input type="hidden" name="vehicle_id" value={selectedId} />
            <VehicleBoard
              vehicles={vehicles}
              rows={availabilityRows}
              loading={availabilityLoading}
              error={availabilityError}
              selectedId={selectedId}
              isEdit={isEdit}
              datesReady={Boolean(start && end)}
              isBlock={isBlock}
              days={days}
              start={start}
              end={end}
              onSelect={(v) => {
                setSelectedId(v.id)
                if (!isEdit || !initial.daily_rate_snap) setRate(v.daily_rate)
              }}
            />
          </section>

          {/* ═══ STEP 2 — Client (reservation) / Motif (block) ═══ */}
          {!isBlock ? (
            <section hidden={currentStep !== 2} className="mx-auto max-w-[540px]">
              {/* Big icon header */}
              <div className="mb-5 flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#1d5b8d]">
                  <User className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Qui est le client ?</h3>
                  <p className="text-sm text-slate-500">Sélectionnez ou créez un nouveau client</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <ClientSelect initialId={initial.client_id} initialName={initial.client_name} />
              </div>

              {/* Context bar — what's selected so far */}
              {selectedVehicle && (
                <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-slate-50 py-3">
                  <div className="flex flex-col items-center gap-1 px-2">
                    <Car className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-800">{selectedVehicle.plate}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 px-2">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-800">{days}j</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 px-2">
                    <CreditCard className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-bold text-[#1d5b8d]">{total.toLocaleString('fr-FR')} DH</span>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section hidden={currentStep !== 2} className="mx-auto max-w-[540px]">
              <div className="mb-5 flex flex-col items-center gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-600">
                  <Ban className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Motif du blocage</h3>
                  <p className="text-sm text-slate-500">Pourquoi cette voiture est indisponible ?</p>
                </div>
              </div>
              <div className="rounded-2xl border border-red-100 bg-white p-4">
                <Field label="Raison" required>
                  <Input name="notes" defaultValue={initial.notes ?? ''} placeholder="Entretien, panne, usage personnel..." />
                </Field>
              </div>
              {selectedVehicle && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm">
                  <Ban className="h-5 w-5 text-red-400" />
                  <span className="font-bold text-red-700">{selectedVehicle.plate}</span>
                  <span className="text-red-600">bloquée {fmtShort(start)} → {fmtShort(end)}</span>
                </div>
              )}
            </section>
          )}

          {/* ═══ STEP 3 — Confirm (reservation only) ═══ */}
          {!isBlock && (
            <section hidden={currentStep !== 3} className="mx-auto max-w-[720px]">
              {isEdit && !initial.is_block && (
                <button type="button" onClick={startRental}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1d5b8d] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#16496f]">
                  <FileText className="h-5 w-5" /> {t('res.startRentalGenerate')}
                </button>
              )}

              {/* Big recap cards grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <RecapCard icon={Car} label="Voiture" value={selectedVehicle?.plate ?? '—'} sub={selectedVehicle?.brand} color="blue" />
                <RecapCard icon={CalendarDays} label="Durée" value={`${days} jour${days > 1 ? 's' : ''}`} sub={`${fmtShort(start)} → ${fmtShort(end)}`} color="blue" />
                <RecapCard icon={CreditCard} label="Prix / jour" value={`${rate.toLocaleString('fr-FR')} DH`} color="emerald" />
                <RecapCard icon={CreditCard} label="Total" value={`${total.toLocaleString('fr-FR')} DH`} color="emerald" large />
              </div>

              <ComplianceBanner checking={checking} checked={checked} issues={issues} severity={worstSeverity} ack={ack} onAck={setAck} />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Tarif</span>
                  </div>
                  <NumberField name="daily_rate_snap" defaultValue={rate} suffix=" DH" onValueChange={(v) => setRate(Number(v) || 0)} />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#1d5b8d]" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Statut</span>
                  </div>
                  <Select name="status" defaultValue={initial.status ?? 'confirmed'}>
                    {RESERVATION_STATUSES.filter((s) => s !== 'cancelled').map((s) => (
                      <option key={s} value={s}>{t(`rstatus.${s}`)}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Départ</span>
                  </div>
                  <Input name="pickup_location" defaultValue={initial.pickup_location ?? ''} placeholder="Agence, aéroport..." />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Retour</span>
                  </div>
                  <Input name="dropoff_location" defaultValue={initial.dropoff_location ?? ''} placeholder="Même lieu" />
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</span>
                </div>
                <Textarea name="notes" defaultValue={initial.notes ?? ''} rows={2} placeholder="Acompte, livraison, demande client..." />
              </div>
            </section>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            {isEdit ? (
              <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-danger)] hover:underline">
                <Trash2 className="h-4 w-4" /> {t('common.delete')}
              </button>
            ) : (
              <button type="button" onClick={() => onOpenChange(false)} className="hidden text-sm font-semibold text-slate-500 hover:text-slate-900 sm:block">
                {t('common.cancel')}
              </button>
            )}
            <div className="ms-auto flex w-full gap-2 sm:w-auto">
              {currentStep > 0 && (
                <Button type="button" variant="secondary" onClick={() => setCurrentStep((s) => Math.max(0, s - 1))} className="min-w-0 flex-1 shadow-none sm:flex-none">
                  <ArrowLeft className="h-4 w-4" /> Retour
                </Button>
              )}
              {currentStep < steps.length - 1 ? (
                <Button type="button" onClick={goNext} style={{ background: isBlock ? '#dc2626' : '#1d5b8d' }} className="min-w-0 flex-1 text-white shadow-none hover:brightness-95 sm:min-w-[160px] sm:flex-none">
                  Continuer <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={doSubmit} loading={busy} disabled={!isBlock && hasBlockingIssues && !ack}
                  style={{ background: isBlock ? '#dc2626' : '#1d5b8d' }}
                  className="min-w-0 flex-1 px-4 text-white shadow-none hover:brightness-95 sm:min-w-[180px] sm:flex-none">
                  <CheckCircle2 className="h-4 w-4" />
                  {isEdit ? t('common.save') : isBlock ? 'Bloquer la voiture' : 'Créer la réservation'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Helpers ─── */

function fmtShort(v: string) { if (!v) return '—'; const [, m, d] = v.split('-'); return `${d}/${m}` }
function fmtFull(v: string) { if (!v) return '—'; const [y, m, d] = v.split('-'); return `${d}/${m}/${y}` }

/* ─── Recap card ─── */

function RecapCard({ icon: Icon, label, value, sub, color, large }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string | null
  color: 'blue' | 'emerald'
  large?: boolean
}) {
  const colors = color === 'emerald'
    ? { bg: 'bg-emerald-50', icon: 'text-emerald-600', value: 'text-emerald-700' }
    : { bg: 'bg-blue-50', icon: 'text-[#1d5b8d]', value: 'text-slate-900' }
  return (
    <div className={cn('flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 text-center', colors.bg)}>
      <Icon className={cn('h-5 w-5', colors.icon)} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={cn('font-black', large ? 'text-lg' : 'text-sm', colors.value)}>{value}</span>
      {sub && <span className="truncate text-[10px] text-slate-500">{sub}</span>}
    </div>
  )
}

/* ─── Vehicle board ─── */

function VehicleBoard({
  vehicles, rows, loading, error, selectedId, isEdit, datesReady, isBlock, days, start, end, onSelect,
}: {
  vehicles: VehicleOption[]; rows: AvailabilityRow[] | null; loading: boolean; error: boolean
  selectedId: string; isEdit: boolean; datesReady: boolean; isBlock: boolean
  days: number; start: string; end: string
  onSelect: (vehicle: VehicleOption) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const fallbackRows = vehicles.map((vehicle) => ({ vehicle, available: false, conflicts: [] as Reservation[] }))
  const sortedRows = rows
    ? [...rows].sort((a, b) => Number(b.available) - Number(a.available) || a.vehicle.plate.localeCompare(b.vehicle.plate))
    : fallbackRows
  const q = query.trim().toLocaleLowerCase()
  const displayRows = sortedRows.filter((r) => !q || `${r.vehicle.plate} ${r.vehicle.brand ?? ''}`.toLocaleLowerCase().includes(q))
  const availableCount = displayRows.filter((r) => r.available || (isEdit && r.vehicle.id === selectedId)).length

  return (
    <div>
      {/* Header with count + search */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', isBlock ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-[#1d5b8d]')}>
            <Car className="h-5 w-5" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900">
              {error ? 'Erreur' : datesReady && rows ? `${availableCount} libre${availableCount !== 1 ? 's' : ''}` : 'Chargement...'}
            </span>
            <span className="ml-2 text-xs text-slate-400">{days}j · {fmtShort(start)} → {fmtShort(end)}</span>
          </div>
        </div>
        <div className="relative w-full sm:w-48">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher..." className="bg-white ps-9 text-sm" />
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" /> Impossible de vérifier le planning.
        </div>
      )}
      {loading && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Vérification...
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {displayRows.map((row) => {
          const v = row.vehicle
          const selected = v.id === selectedId
          const verified = Boolean(rows)
          const selectable = (verified && row.available) || selected || isEdit
          const isAvail = verified && row.available
          const conflict = row.conflicts[0]
          return (
            <button key={v.id} type="button" disabled={!selectable}
              onClick={() => onSelect({ id: v.id, plate: v.plate, brand: v.brand, daily_rate: Number(v.daily_rate) || 0, image_url: v.image_url, status: v.status })}
              className={cn(
                'group relative overflow-hidden rounded-xl border text-start transition',
                selected
                  ? isBlock ? 'border-red-400 bg-red-50 ring-1 ring-red-400/20' : 'border-[#1d5b8d] bg-blue-50/60 ring-1 ring-[#1d5b8d]/20'
                  : selectable ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm' : 'cursor-not-allowed border-slate-100 bg-slate-50/60 opacity-45',
              )}>
              {/* Car image top */}
              <div className={cn('flex h-32 items-center justify-center overflow-hidden rounded-t-xl', isAvail ? 'bg-slate-100' : 'bg-slate-50')}>
                {v.image_url ? (
                  <img src={v.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                ) : (
                  <Car className="h-10 w-10 text-slate-300" />
                )}
              </div>
              {/* Info */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-black text-slate-900">{v.plate}</span>
                  {/* Status dot */}
                  {selected ? (
                    <div className={cn('flex h-5 w-5 items-center justify-center rounded-full text-white', isBlock ? 'bg-red-500' : 'bg-[#1d5b8d]')}>
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                  ) : (
                    <div className={cn('h-2 w-2 rounded-full', isAvail ? 'bg-emerald-400' : verified ? 'bg-red-300' : 'bg-slate-200')} />
                  )}
                </div>
                <span className="block truncate text-[11px] text-slate-500">{v.brand ?? t('common.vehicle')}</span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1d5b8d]">{Number(v.daily_rate || 0).toLocaleString('fr-FR')} DH/j</span>
                  {isAvail && <span className="text-[10px] font-bold text-emerald-600">LIBRE</span>}
                  {!isAvail && verified && !selected && <span className="text-[10px] font-bold text-red-400">OCCUPÉE</span>}
                </div>
                {!isAvail && conflict && (
                  <span className="mt-0.5 block truncate text-[10px] text-amber-600">{fmtShort(conflict.date_start)} → {fmtShort(conflict.date_end)}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {displayRows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center">
          <Search className="h-8 w-8 text-slate-200" />
          <span className="text-sm text-slate-500">Aucune voiture trouvée.</span>
        </div>
      )}
    </div>
  )
}

/* ─── Compliance banner ─── */

const DOC_KEY: Record<string, string> = { insurance: 'vd.insurance', vignette: 'vd.vignette', visite: 'vd.visiteTech', oil: 'vd.oilChange' }

function ComplianceBanner({ checking, checked, issues, severity, ack, onAck }: {
  checking: boolean; checked: boolean; issues: ComplianceIssue[]; severity: 'expired' | 'lapses'; ack: boolean; onAck: (v: boolean) => void
}) {
  const { t } = useI18n()

  if (checking) return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('res.compChecking')}
    </div>
  )

  if (checked && issues.length === 0) return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700">
      <ShieldCheck className="h-5 w-5" /> {t('res.compClear')}
    </div>
  )

  if (issues.length === 0) return null

  const danger = severity === 'expired'
  const txt = (i: ComplianceIssue) => {
    const name = i.label ?? t(DOC_KEY[i.code] ?? i.code)
    if (i.code === 'oil') return i.severity === 'expired' ? t('res.compOilOverdue') : t('res.compOilDue')
    return i.severity === 'expired' ? t('res.compExpired', { doc: name, date: i.date ?? '' }) : t('res.compLapses', { doc: name, date: i.date ?? '' })
  }

  return (
    <div className={cn('rounded-xl border px-3.5 py-3', danger ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
      <div className={cn('flex items-center gap-2 text-sm font-bold', danger ? 'text-red-700' : 'text-amber-700')}>
        <AlertTriangle className="h-5 w-5 shrink-0" /> {t('res.compTitle')}
      </div>
      <ul className="mt-1.5 space-y-1 ps-6 text-xs text-slate-600">
        {issues.map((i, idx) => <li key={`${i.code}-${idx}`} className="list-disc">{txt(i)}</li>)}
      </ul>
      <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-black/5 pt-2 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} className="h-4 w-4 rounded accent-[#1d5b8d]" />
        {t('res.compAck')}
      </label>
    </div>
  )
}
