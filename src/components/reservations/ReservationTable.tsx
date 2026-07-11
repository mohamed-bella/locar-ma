import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarClock, Car, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Reservation } from '~/server/reservations'
import { bulkDeleteReservations } from '~/server/reservations'
import { reservationLabel, resBadgeTone } from '~/lib/reservations'
import { Badge, Button, Card, CardHeader, EmptyState, Modal } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import { useRouter } from '@tanstack/react-router'
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
  const router = useRouter()
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]))
  const rows = [...reservations].sort((a, b) => a.date_start.localeCompare(b.date_start))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  async function handleBulkDelete() {
    setDeleting(true)
    try {
      const result = await bulkDeleteReservations({ data: { ids: [...selected] } })
      toast.success(t('common.bulkDeleted', { n: result.deleted }))
      if (result.skipped > 0) toast.warning(t('common.bulkDeleteSkipped', { n: result.skipped }))
      setSelected(new Set())
      setConfirmOpen(false)
      router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const hasSelection = selected.size > 0

  return (
    <Card className="mt-5">
      <CardHeader
        title={t('res.bookingsInView')}
        subtitle={hasSelection ? t('common.selected', { n: selected.size }) : t('res.inRange', { n: rows.length })}
      />

      {hasSelection && (
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface-muted)] px-4 py-2">
          <Button variant="secondary" size="sm" onClick={toggleAll}>
            {selected.size === rows.length ? t('common.deselectAll') : t('common.selectAll')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" /> {t('common.deleteSelected')}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('res.noBookingsView')} description={t('res.dragToAdd')} />
      ) : (
        <>
        {/* Mobile: stacked cards */}
        <div className="divide-y divide-[var(--color-line)] md:hidden">
          {rows.map((r) => {
            const v = vehicleMap.get(r.vehicle_id)
            return (
              <div key={r.id} className="flex items-center gap-2 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="h-4 w-4 shrink-0 rounded border-[var(--color-line)] accent-[var(--color-primary)]"
                />
                <button
                  onClick={() => onOpen(r)}
                  className="flex flex-1 items-center gap-3 text-start active:bg-[var(--color-surface-muted)]"
                >
                  <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
                    {v?.image_url ? (
                      <img src={v.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <Car className="h-6 w-6 text-[var(--color-faint)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-[var(--color-ink)]">{v?.plate ?? '—'}</span>
                      <Badge tone={r.is_block ? 'neutral' : resBadgeTone(r.status)} dot>
                        {r.is_block ? t('res.blocked') : t(`rstatus.${r.status}`)}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{reservationLabel(r)}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--color-muted)]">
                        {fmt(r.date_start)} → {fmt(r.date_end)}
                      </span>
                      <span className="font-semibold tnum text-[var(--color-ink)]">
                        {r.is_block ? '—' : `${(r.total_amount ?? 0).toLocaleString()} MAD`}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-[var(--color-line)] text-start text-xs uppercase tracking-wide text-[var(--color-faint)]">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-primary)]"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">{t('common.vehicle')}</th>
                <th className="px-2 py-2.5 font-medium">{t('common.client')}</th>
                <th className="px-2 py-2.5 font-medium">{t('common.dates')}</th>
                <th className="px-2 py-2.5 text-end font-medium">{t('res.total')}</th>
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
                    <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 rounded border-[var(--color-line)] accent-[var(--color-primary)]"
                      />
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink)]">
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
                    <td className="px-2 py-3 text-end font-medium tnum">
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
        </>
      )}

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('common.bulkDeleteTitle', { n: selected.size })}
        description={t('common.bulkDeleteDesc')}
      >
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={deleting} onClick={handleBulkDelete}>{t('common.delete')}</Button>
        </div>
      </Modal>
    </Card>
  )
}
