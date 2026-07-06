import { format } from 'date-fns'
import { CalendarClock, Car } from 'lucide-react'
import type { Reservation } from '~/server/reservations'
import { reservationLabel, resBadgeTone } from '~/lib/reservations'
import { Badge, Card, CardHeader, EmptyState } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import type { VehicleOption } from './ReservationDrawer'

const fmt = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM')

export function ReservationTable({
  reservations,
  vehicles,
  onOpen,
}: {
  reservations: Reservation[]
  vehicles: VehicleOption[]
  onOpen: (r: Reservation) => void
}) {
  const { t } = useI18n()
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]))
  const rows = [...reservations].sort((a, b) => a.date_start.localeCompare(b.date_start))

  return (
    <Card className="mt-5">
      <CardHeader title={t('res.bookingsInView')} subtitle={t('res.inRange', { n: rows.length })} />
      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('res.noBookingsView')} description={t('res.dragToAdd')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-[var(--color-faint)]">
                <th className="px-5 py-2.5 font-medium">{t('common.vehicle')}</th>
                <th className="px-2 py-2.5 font-medium">{t('common.client')}</th>
                <th className="px-2 py-2.5 font-medium">{t('common.dates')}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t('res.total')}</th>
                <th className="px-5 py-2.5 font-medium">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = vehicleMap.get(r.vehicle_id)
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r)}
                    className="cursor-pointer border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-muted)]"
                  >
                    <td className="px-5 py-3 text-[var(--color-ink)]">
                      {v ? (
                        <div className="flex items-center gap-2.5">
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)] flex items-center justify-center">
                            {v.image_url ? (
                              <img src={v.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            ) : (
                              <Car className="h-6 w-6 text-[var(--color-faint)]" />
                            )}
                          </div>
                          <div className="min-w-0 font-normal">
                            <div className="text-sm font-semibold truncate leading-tight text-[var(--color-ink)]">
                              {v.plate}
                            </div>
                            {v.brand && (
                              <div className="text-xs text-[var(--color-muted)] truncate leading-normal">
                                {v.brand}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-3 font-medium">{reservationLabel(r)}</td>
                    <td className="px-2 py-3 text-[var(--color-muted)]">
                      {fmt(r.date_start)} → {fmt(r.date_end)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium tnum">
                      {r.is_block ? '—' : `${(r.total_amount ?? 0).toLocaleString()} MAD`}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={r.is_block ? 'neutral' : resBadgeTone(r.status)} dot>
                        {r.is_block ? t('res.blocked') : t(`rstatus.${r.status}`)}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
