import { useState } from 'react'
import { createFileRoute, Link, useRouter, useNavigate, notFound } from '@tanstack/react-router'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Camera,
  Car,
  Wrench,
  CalendarPlus,
  CalendarClock,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getVehicle,
  updateVehicle,
  setVehicleStatus,
  listDamageReports,
  presignDamageUploads,
  createDamageReport,
} from '~/server/fleet'
import { listVehicleReservations, type VehicleReservation } from '~/server/reservations'
import { listServicePlans, listServiceRecords } from '~/server/maintenance'
import { listVehicleExpenses } from '~/server/expenses'
import { VehicleForm } from '~/components/VehicleForm'
import { Gallery } from '~/components/Gallery'
import { SuiviBoard } from '~/components/suivi/SuiviBoard'
import { DeleteVehicleDialog } from '~/components/DeleteVehicleDialog'
import { resBadgeTone } from '~/lib/reservations'
import { brandColor } from '~/lib/brandColor'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardBody,
  Select,
  Input,
  SlideOver,
  EmptyState,
  cn,
} from '~/components/ui'

export const Route = createFileRoute('/_app/fleet/$vehicleId')({
  loader: async ({ params }) => {
    const [vehicle, damage, alertRules, documentTypes, reservations, servicePlans, serviceRecords, expenses] = await Promise.all([
      getVehicle({ data: { id: params.vehicleId } }),
      listDamageReports({ data: { vehicle_id: params.vehicleId } }),
      listAlertRules(),
      listDocumentTypes(),
      listVehicleReservations({ data: { vehicle_id: params.vehicleId } }),
      listServicePlans(),
      listServiceRecords({ data: { vehicle_id: params.vehicleId } }),
      listVehicleExpenses({ data: { vehicle_id: params.vehicleId } }),
    ])
    if (!vehicle) throw notFound()
    return { vehicle, damage, alertRules, documentTypes, reservations, servicePlans, serviceRecords, expenses }
  },
  component: VehicleDetail,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
    </div>
  ),
  notFoundComponent: VehicleNotFound,
})

function VehicleNotFound() {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={Car}
      title={t('fleet.notFound')}
      description={t('fleet.notFoundDesc')}
      action={
        <Link to="/fleet">
          <Button variant="secondary">{t('fleet.backToFleet')}</Button>
        </Link>
      }
    />
  )
}

function VehicleDetail() {
  const { vehicle, damage, alertRules, documentTypes, reservations, servicePlans, serviceRecords, expenses } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useRealtimeInvalidate('vehicles', `id=eq.${vehicle.id}`)
  useRealtimeInvalidate('document_alert_rules')
  useRealtimeInvalidate('reservations')
  useRealtimeInvalidate('service_records')
  useRealtimeInvalidate('vehicle_expenses')

  async function changeStatus(status: 'available' | 'maintenance') {
    try {
      await setVehicleStatus({ data: { id: vehicle.id, status } })
      toast.success(t('fleet.statusSet', { status: t(`status.${status}`) }))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  function addReservation() {
    navigate({ to: '/reservations', search: { new: true, vehicle: vehicle.id } })
  }

  const title = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ')
  const band = brandColor(vehicle.brand || vehicle.model || vehicle.plate)

  return (
    <div>
      <Link
        to="/fleet"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> {t('fleet.title')}
      </Link>

      {/* Bold colored hero banner — the car's identity */}
      <div
        className="mt-3 overflow-hidden rounded-2xl shadow-[var(--shadow-pop)]"
        style={{ backgroundColor: band }}
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-3.5">
            {vehicle.brand_logo_url && (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-sm">
                <img src={vehicle.brand_logo_url} alt="" className="h-full w-full object-contain" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black uppercase tracking-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.28)] sm:text-[30px]">
                {title || vehicle.plate}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-black/20 px-2 py-0.5 font-mono text-[12px] font-bold tracking-wider text-white">
                  {vehicle.plate}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  {t(`status.${vehicle.status}`)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {vehicle.status === 'maintenance' ? (
              <Button variant="secondary" onClick={() => changeStatus('available')}>
                {t('fleet.markAvailable')}
              </Button>
            ) : vehicle.status === 'rented' ? (
              <span className="rounded-lg bg-white/15 px-3 py-2 text-xs font-medium text-white backdrop-blur">
                {t('fleet.managedByBookings')}
              </span>
            ) : (
              <Button variant="secondary" onClick={() => changeStatus('maintenance')}>
                <Wrench className="h-4 w-4" /> {t('fleet.setMaintenance')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> {t('common.edit')}
            </Button>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="mt-6">
        <Gallery urls={vehicle.image_urls} />
      </div>

      {/* Details */}
      <div className="mt-6">
        <Card>
          <CardHeader title={t('vd.details')} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
              <Info label={t('vd.dailyRate')} value={`${vehicle.daily_rate.toLocaleString()} MAD`} />
              <Info label={t('vd.category')} value={vehicle.category ? t(`cat.${vehicle.category}`) : '—'} />
              <Info label={t('vd.mileage')} value={`${vehicle.mileage_current.toLocaleString()} km`} />
              <Info label={t('vf.year')} value={vehicle.year ?? '—'} />
            </dl>
            {vehicle.notes && (
              <div className="mt-5 rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-ink-soft)]">
                {vehicle.notes}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Tracking & maintenance cockpit — papers + mechanical, one tile each */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-black tracking-tight text-[var(--color-ink)]">{t('si.manage')}</h2>
        <SuiviBoard
          vehicle={vehicle}
          servicePlans={servicePlans}
          serviceRecords={serviceRecords}
          alertRules={alertRules}
          documentTypes={documentTypes}
          expenses={expenses}
          onChanged={() => router.invalidate()}
        />
      </div>

      {/* Reservations for this car */}
      <div className="mt-5">
        <ReservationsSection reservations={reservations} onAdd={addReservation} />
      </div>

      <DamageLog vehicleId={vehicle.id} reports={damage} />

      <button
        onClick={() => setDeleting(true)}
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-danger)] hover:underline"
      >
        <Trash2 className="h-4 w-4" /> {t('fleet.deleteVehicle')}
      </button>

      <DeleteVehicleDialog
        open={deleting}
        onOpenChange={setDeleting}
        vehicleId={vehicle.id}
        plate={vehicle.plate}
        onDeleted={() => router.navigate({ to: '/fleet' })}
      />

      <SlideOver open={editing} onOpenChange={setEditing} title={`${t('common.edit')} · ${vehicle.plate}`} description={vehicle.plate}>
        <VehicleForm
          initial={vehicle}
          submitLabel={t('common.saveChanges')}
          documentTypes={documentTypes}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await updateVehicle({ data: { ...(values as any), id: vehicle.id } })
            setEditing(false)
            toast.success(t('fleet.vehicleUpdated'))
            await router.invalidate()
          }}
        />
      </SlideOver>
    </div>
  )
}

function Info({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-faint)]">{label}</dt>
      <dd className={cn('mt-1 font-medium text-[var(--color-ink)] tnum', className)}>{value ?? '—'}</dd>
    </div>
  )
}

function ReservationsSection({
  reservations,
  onAdd,
}: {
  reservations: VehicleReservation[]
  onAdd: () => void
}) {
  const { t } = useI18n()
  const today = format(new Date(), 'yyyy-MM-dd')
  const live = (r: VehicleReservation) => r.status !== 'cancelled' && r.status !== 'closed'

  const current = reservations
    .filter((r) => live(r) && r.date_start <= today && r.date_end >= today)
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
  const upcoming = reservations
    .filter((r) => live(r) && r.date_start > today)
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
  const past = reservations
    .filter((r) => !current.includes(r) && !upcoming.includes(r))
    .sort((a, b) => b.date_end.localeCompare(a.date_end))

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarClock className="h-[18px] w-[18px] text-[var(--color-brand)]" />
            {t('fleet.reservations')}
          </span>
        }
        subtitle={t('fleet.reservationsSub', { n: reservations.length })}
        action={
          <Button size="sm" onClick={onAdd}>
            <CalendarPlus className="h-4 w-4" /> {t('fleet.addReservation')}
          </Button>
        }
      />
      <CardBody className="p-0">
        {reservations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">{t('fleet.noReservations')}</p>
        ) : (
          <div>
            <ResGroup label={t('fleet.grpCurrent')} rows={current} tone="ok" />
            <ResGroup label={t('fleet.grpUpcoming')} rows={upcoming} tone="info" />
            <ResGroup label={t('fleet.grpPast')} rows={past} tone="neutral" />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ResGroup({
  label,
  rows,
  tone,
}: {
  label: string
  rows: VehicleReservation[]
  tone: 'ok' | 'info' | 'neutral'
}) {
  const { t } = useI18n()
  if (rows.length === 0) return null
  return (
    <div className="border-b border-[var(--color-line)] last:border-b-0">
      <div className="flex items-center gap-2 bg-[var(--color-surface-muted)]/50 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">
        <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'ok' ? 'bg-[var(--color-ok)]' : tone === 'info' ? 'bg-[var(--color-info)]' : 'bg-[var(--color-faint)]')} />
        {label} · {rows.length}
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t border-[var(--color-line)] px-5 py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">
                {r.client_name ?? (r.is_block ? t('res.blocked') : t('fin.noClient'))}
              </div>
              <div className="truncate text-xs tnum text-[var(--color-muted)]">
                {format(new Date(`${r.date_start}T00:00:00`), 'd MMM yyyy')} →{' '}
                {format(new Date(`${r.date_end}T00:00:00`), 'd MMM yyyy')}
                {r.total_amount != null ? ` · ${r.total_amount.toLocaleString()} MAD` : ''}
              </div>
            </div>
            {r.contract_id && (
              <Link
                to="/contracts/$contractId"
                params={{ contractId: r.contract_id }}
                className="text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
              >
                {t('con.number')}
              </Link>
            )}
            <Badge tone={resBadgeTone(r.status)}>
              {r.is_block ? t('res.blocked') : t(`rstatus.${r.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DamageLog({
  vehicleId,
  reports,
}: {
  vehicleId: string
  reports: Awaited<ReturnType<typeof listDamageReports>>
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const type = String(fd.get('type')) as 'pickup' | 'return'
    const notes = String(fd.get('notes') ?? '')
    const files = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)

    setBusy(true)
    try {
      let keys: string[] = []
      if (files.length > 0) {
        const signed = await presignDamageUploads({
          data: { vehicle_id: vehicleId, files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) },
        })
        await Promise.all(
          signed.map((s, i) =>
            fetch(s.url, {
              method: 'PUT',
              body: files[i],
              headers: { 'Content-Type': files[i].type },
            }).then((r) => {
              if (!r.ok) throw new Error(`Upload failed (${r.status})`)
            }),
          ),
        )
        keys = signed.map((s) => s.key)
      }
      await createDamageReport({
        data: { vehicle_id: vehicleId, type, photo_keys: keys, notes: notes || undefined },
      })
      form.reset()
      toast.success(t('vd.reportSaved'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('vd.reportFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader title={t('vd.damageLog')} subtitle={t('vd.damageSubtitle')} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-36">
            <Select name="type" defaultValue="pickup">
              <option value="pickup">{t('vd.pickup')}</option>
              <option value="return">{t('vd.return')}</option>
            </Select>
          </div>
          <Input name="notes" placeholder={t('vd.notesPlaceholder')} className="flex-1" />
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
            <Camera className="h-4 w-4" /> {t('vd.photos')}
            <input name="photos" type="file" accept="image/*" multiple capture="environment" hidden />
          </label>
          <Button type="submit" loading={busy}>
            {t('vd.addReport')}
          </Button>
        </form>

        <ul className="mt-6 space-y-5">
          {reports.length === 0 && (
            <li className="text-sm text-[var(--color-faint)]">{t('vd.noReports')}</li>
          )}
          {reports.map((r) => (
            <li key={r.id} className="border-t border-[var(--color-line)] pt-4 first:border-0 first:pt-0">
              <div className="flex items-center gap-2 text-sm">
                <Badge tone={r.type === 'return' ? 'info' : 'neutral'}>{t(`vd.${r.type}`)}</Badge>
                <span className="text-xs text-[var(--color-faint)]">
                  {new Date(r.recorded_at).toLocaleString()}
                </span>
              </div>
              {r.notes && <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">{r.notes}</p>}
              {r.photo_urls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.photo_urls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img
                        src={u}
                        alt=""
                        className="h-20 w-20 rounded-lg border border-[var(--color-line)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
