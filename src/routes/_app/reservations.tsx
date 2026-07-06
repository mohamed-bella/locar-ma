import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { addDays, format, parseISO } from 'date-fns'
import { Plus, CalendarSearch, ChevronLeft, ChevronRight, CalendarDays, Table } from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listReservations, type Reservation } from '~/server/reservations'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { PlanningCalendar } from '~/components/reservations/PlanningCalendar'
import { ReservationTable } from '~/components/reservations/ReservationTable'
import { AvailabilityChecker } from '~/components/reservations/AvailabilityChecker'
import { ReservationDrawer, type VehicleOption } from '~/components/reservations/ReservationDrawer'
import { Button, PageHeader, Badge, TableSkeleton, cn } from '~/components/ui'

const DAYS = 21

export const Route = createFileRoute('/_app/reservations')({
  validateSearch: (s: Record<string, unknown>): { start?: string; new?: boolean; vehicle?: string } => ({
    start: typeof s.start === 'string' ? s.start : undefined,
    new: s.new === true || s.new === 'true' ? true : undefined,
    vehicle: typeof s.vehicle === 'string' ? s.vehicle : undefined,
  }),
  loaderDeps: ({ search }) => ({ start: search.start }),
  loader: async ({ deps }) => {
    const windowStart = deps.start ? parseISO(deps.start) : addDays(new Date(), -2)
    const from = format(windowStart, 'yyyy-MM-dd')
    const to = format(addDays(windowStart, DAYS - 1), 'yyyy-MM-dd')
    const [vehicles, reservations] = await Promise.all([
      listVehicles(),
      listReservations({ data: { from, to } }),
    ])
    return {
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
      reservations,
      startISO: from,
    }
  },
  component: Reservations,
  pendingComponent: ReservationsPending,
})

function ReservationsPending() {
  const { t } = useI18n()
  return (
    <div>
      <PageHeader title={t('res.title')} subtitle={t('common.loading')} />
      <div className="mt-6">
        <TableSkeleton rows={6} />
      </div>
    </div>
  )
}

type DrawerState = { open: boolean; initial: Parameters<typeof ReservationDrawer>[0]['initial'] }

function Reservations() {
  const { vehicles, reservations, startISO } = Route.useLoaderData()
  const { new: wantNew, vehicle: wantVehicle } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useI18n()
  useRealtimeInvalidate('reservations')

  const windowStart = parseISO(startISO)
  const windowEnd = addDays(windowStart, DAYS - 1)

  const [drawer, setDrawer] = useState<DrawerState>({ open: false, initial: {} })
  const [checkOpen, setCheckOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'calendar' | 'table'>('table')

  // Deep-link: /reservations?new=true opens the create drawer (dashboard CTA).
  useEffect(() => {
    if (wantNew && vehicles.length > 0) {
      const preselect = wantVehicle && vehicles.some((v) => v.id === wantVehicle) ? wantVehicle : vehicles[0]?.id
      setDrawer({
        open: true,
        initial: {
          vehicle_id: preselect,
          date_start: format(new Date(), 'yyyy-MM-dd'),
          date_end: format(new Date(), 'yyyy-MM-dd'),
        },
      })
      navigate({ to: '/reservations', search: { start: startISO }, replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew])

  function shift(byDays: number) {
    navigate({ to: '/reservations', search: { start: format(addDays(windowStart, byDays), 'yyyy-MM-dd') } })
  }
  function today() {
    navigate({ to: '/reservations', search: { start: format(addDays(new Date(), -2), 'yyyy-MM-dd') } })
  }

  function openCreate(vehicleId: string, date_start: string, date_end: string) {
    setDrawer({ open: true, initial: { vehicle_id: vehicleId, date_start, date_end } })
  }
  function openReservation(r: Reservation) {
    setDrawer({
      open: true,
      initial: {
        id: r.id,
        vehicle_id: r.vehicle_id,
        client_id: r.client_id,
        client_name: r.client_name,
        date_start: r.date_start,
        date_end: r.date_end,
        daily_rate_snap: r.daily_rate_snap,
        status: r.status,
        pickup_location: r.pickup_location,
        dropoff_location: r.dropoff_location,
        notes: r.notes,
        is_block: r.is_block,
      },
    })
  }

  return (
    <div>
      <PageHeader
        title={t('res.title')}
        subtitle={activeTab === 'calendar' ? t('res.calendarSubtitle') : t('res.tableSubtitle')}
        actions={
          <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              disabled={vehicles.length === 0}
              onClick={() => setCheckOpen(true)}
            >
              <CalendarSearch className="h-[18px] w-[18px]" /> {t('res.checkAvailability')}
            </Button>
            <Button
              size="lg"
              className="w-full sm:w-auto font-semibold"
              disabled={vehicles.length === 0}
              onClick={() =>
                setDrawer({
                  open: true,
                  initial: {
                    vehicle_id: vehicles[0]?.id,
                    date_start: format(new Date(), 'yyyy-MM-dd'),
                    date_end: format(new Date(), 'yyyy-MM-dd'),
                  },
                })
              }
            >
              <Plus className="h-[18px] w-[18px]" /> {t('res.new')}
            </Button>
          </div>
        }
      />

      {/* Toolbar: view switch · window navigation · color legend */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg bg-[var(--color-surface-muted)] p-1 border border-[var(--color-line)] shrink-0">
            <button
              onClick={() => setActiveTab('table')}
              aria-label={t('res.tableView')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-all select-none',
                activeTab === 'table'
                  ? 'bg-white shadow-[var(--shadow-card)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              <Table className="h-4 w-4" /> {t('res.tableView')}
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              aria-label={t('res.calendarView')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-all select-none',
                activeTab === 'calendar'
                  ? 'bg-white shadow-[var(--shadow-card)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
              )}
            >
              <CalendarDays className="h-4 w-4" /> {t('res.calendarView')}
            </button>
          </div>

          {activeTab === 'calendar' && (
            <>
              <div className="h-4 w-px bg-[var(--color-line-strong)] hidden sm:block" />
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={() => shift(-DAYS)} aria-label={t('common.prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={today}>
                  {t('res.today')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => shift(DAYS)} aria-label={t('common.next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="ml-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)]">
                  <CalendarDays className="h-4 w-4 text-[var(--color-faint)]" />
                  {format(windowStart, 'd MMM')} – {format(windowEnd, 'd MMM yyyy')}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Legend tone="info" label={t('rstatus.confirmed')} />
          <Legend tone="ok" label={t('rstatus.active')} />
          <Legend tone="warn" label={t('rstatus.pending')} />
          <Legend tone="neutral" label={t('res.blocked')} />
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <div className="mt-4">
          <PlanningCalendar
            vehicles={vehicles}
            reservations={reservations}
            windowStart={windowStart}
            days={DAYS}
            onCreateRange={openCreate}
            onOpenReservation={openReservation}
          />
        </div>
      ) : (
        <div className="mt-4">
          <ReservationTable reservations={reservations} vehicles={vehicles} onOpen={openReservation} />
        </div>
      )}

      <AvailabilityChecker
        open={checkOpen}
        onOpenChange={setCheckOpen}
        defaultStart={startISO}
        onBook={(vehicleId, from, to) =>
          setDrawer({ open: true, initial: { vehicle_id: vehicleId, date_start: from, date_end: to } })
        }
        onEdit={openReservation}
      />

      <ReservationDrawer
        open={drawer.open}
        onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))}
        vehicles={vehicles}
        initial={drawer.initial}
        onSaved={() => router.invalidate()}
      />
    </div>
  )
}

function Legend({ tone, label }: { tone: 'info' | 'ok' | 'warn' | 'neutral'; label: string }) {
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}
