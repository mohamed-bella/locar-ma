import { useState } from 'react'
import { createFileRoute, Link, useRouter, notFound } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowLeft, Car, CalendarClock, FileText, Pencil, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getReservationDetail } from '~/server/reservations'
import { getContractByReservation, createContractFromReservation } from '~/server/contracts'
import { listVehicles } from '~/server/fleet'
import { resBadgeTone } from '~/lib/reservations'
import { waLink } from '~/lib/whatsapp'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, Card, CardHeader, CardBody, EmptyState, PageLoader } from '~/components/ui'
import { ReservationDrawer, type VehicleOption } from '~/components/reservations/ReservationDrawer'
import { ContractPanel } from '~/components/contracts/ContractPanel'

export const Route = createFileRoute('/_app/reservations/$reservationId')({
  loader: async ({ params }) => {
    const reservation = await getReservationDetail({ data: { id: params.reservationId } })
    if (!reservation) throw notFound()
    const [contract, vehicles] = await Promise.all([
      reservation.is_block
        ? Promise.resolve(null)
        : getContractByReservation({ data: { reservation_id: params.reservationId } }),
      listVehicles(),
    ])
    return {
      reservation,
      contract,
      vehicles: vehicles.map(
        (v): VehicleOption => ({
          id: v.id,
          plate: v.plate,
          brand: v.brand,
          daily_rate: v.daily_rate,
          image_url: v.image_urls[0] || null,
          status: v.status,
        }),
      ),
    }
  },
  component: ReservationDetailPage,
  pendingComponent: () => <PageLoader />,
  notFoundComponent: ReservationNotFound,
})

function ReservationNotFound() {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={CalendarClock}
      title={t('con.notFound')}
      action={
        <Link to="/reservations">
          <Button variant="secondary">{t('res.title')}</Button>
        </Link>
      }
    />
  )
}

const fmt = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM yyyy')

function ReservationDetailPage() {
  const { reservation: r, contract, vehicles } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()
  useRealtimeInvalidate('reservations')
  useRealtimeInvalidate('contracts')

  const [editOpen, setEditOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function generateContract() {
    setGenerating(true)
    try {
      const result = await createContractFromReservation({ data: { reservation_id: r.id } })
      if (!result?.id) throw new Error(result?.error ?? t('con.couldNotGenerate'))
      toast.success(t('con.generatingContract'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('con.couldNotGenerate'))
    } finally {
      setGenerating(false)
    }
  }

  const phone = r.client?.phone?.replace(/\D/g, '') ?? ''

  return (
    <div className="max-w-5xl">
      <Link
        to="/reservations"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> {t('res.title')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-ink)]">
            {r.is_block ? t('res.blocked') : (r.client?.full_name ?? t('fin.noClient'))}
          </h1>
          <Badge tone={r.is_block ? 'neutral' : resBadgeTone(r.status)} dot>
            {r.is_block ? t('res.blocked') : t(`rstatus.${r.status}`)}
          </Badge>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> {t('res.editBooking')}
        </Button>
      </div>

      {/* Booking summary */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('res.bookingDetails')} />
          <CardBody className="space-y-3 text-sm">
            <Line label={t('common.client')} value={r.client?.full_name ?? '—'} />
            <Line label={t('cli.cin')} value={r.client?.cin_passport ?? '—'} />
            <Line
              label={t('cli.phone')}
              value={
                r.client?.phone ? (
                  <a
                    href={waLink(r.client.phone, '')}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 font-medium text-[var(--color-brand)] hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {r.client.phone}
                  </a>
                ) : (
                  '—'
                )
              }
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t('common.vehicle')} />
          <CardBody>
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
                {r.vehicle?.image_url ? (
                  <img src={r.vehicle.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Car className="h-7 w-7 text-[var(--color-faint)]" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <Line
                  label={t('common.vehicle')}
                  value={
                    r.vehicle
                      ? `${r.vehicle.plate} · ${[r.vehicle.brand, r.vehicle.model, r.vehicle.year].filter(Boolean).join(' ')}`
                      : '—'
                  }
                />
                <Line label={t('common.dates')} value={`${fmt(r.date_start)} → ${fmt(r.date_end)}`} />
                {(r.pickup_location || r.dropoff_location) && (
                  <Line
                    label={`${t('res.pickup')} / ${t('res.dropoff')}`}
                    value={[r.pickup_location, r.dropoff_location].filter(Boolean).join(' → ') || '—'}
                  />
                )}
                {!r.is_block && (
                  <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                    <span className="text-[var(--color-muted)]">{t('res.total')}</span>
                    <span className="text-lg font-bold tnum text-[var(--color-brand)]">
                      {(r.total_amount ?? 0).toLocaleString()} MAD
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Contract section — inline. Blocks have no contract. */}
      {!r.is_block && (
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--color-muted)]" />
            <h2 className="text-lg font-bold text-[var(--color-ink)]">{t('res.contractSection')}</h2>
          </div>
          {contract ? (
            <ContractPanel contract={contract} />
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={FileText}
                  title={t('res.noContractYet')}
                  description={t('res.noContractYetDesc')}
                  action={
                    <Button loading={generating} onClick={generateContract}>
                      <FileText className="h-4 w-4" /> {t('res.generateContract')}
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <ReservationDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicles={vehicles}
        initial={{
          id: r.id,
          vehicle_id: r.vehicle_id,
          client_id: r.client_id,
          client_name: r.client?.full_name ?? undefined,
          date_start: r.date_start,
          date_end: r.date_end,
          daily_rate_snap: r.daily_rate_snap ?? undefined,
          status: r.status,
          pickup_location: r.pickup_location,
          dropoff_location: r.dropoff_location,
          notes: r.notes,
          is_block: r.is_block,
        }}
        onSaved={() => router.invalidate()}
      />
    </div>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--color-ink)]">{value}</span>
    </div>
  )
}
