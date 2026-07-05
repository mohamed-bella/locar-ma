import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { AlertTriangle, FileText, Trash2, Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  listVehicleReservations,
  setReservationStatus,
  type VehicleReservation,
} from '~/server/reservations'
import { deleteVehicleCascade } from '~/server/fleet'
import { resBadgeTone } from '~/lib/reservations'
import { useI18n } from '~/lib/i18n'
import { Modal, Button, Badge } from '~/components/ui'

const fmt = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM yyyy')

// Instead of a raw FK error, show exactly what a car delete will remove and let
// the owner cancel bookings first or wipe everything in one FK-safe cascade.
export function DeleteVehicleDialog({
  open,
  onOpenChange,
  vehicleId,
  plate,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vehicleId: string
  plate: string
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [rows, setRows] = useState<VehicleReservation[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !vehicleId) return
    setRows(null)
    listVehicleReservations({ data: { vehicle_id: vehicleId } })
      .then(setRows)
      .catch(() => setRows([]))
  }, [open, vehicleId])

  const contracts = (rows ?? []).filter((r) => r.contract_id).length
  const activeCount = (rows ?? []).filter((r) => r.status !== 'cancelled').length

  async function cancelOne(id: string) {
    setCancelling(id)
    try {
      await setReservationStatus({ data: { id, status: 'cancelled' } })
      setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)) ?? rs)
      toast.success(t('rstatus.cancelled'))
    } catch (e: any) {
      toast.error(e?.message ?? t('common.actionFailed'))
    } finally {
      setCancelling(null)
    }
  }

  async function deleteAll() {
    setBusy(true)
    try {
      const r = await deleteVehicleCascade({ data: { id: vehicleId } })
      toast.success(t('fleet.vehicleDeletedWith', { r: r.reservations, c: r.contracts }))
      onOpenChange(false)
      onDeleted()
    } catch (e: any) {
      toast.error(e?.message ?? t('fleet.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  const hasLinked = (rows?.length ?? 0) > 0

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('fleet.deleteTitle', { plate })}
      description={hasLinked ? t('fleet.deleteImpact') : t('fleet.deleteSimple')}
    >
      {rows === null ? (
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {hasLinked && (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('fleet.deleteCounts', { r: rows.length, c: contracts })}
              </div>

              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={resBadgeTone(r.status)}>
                          {r.is_block ? t('res.blocked') : t(`rstatus.${r.status}`)}
                        </Badge>
                        {r.contract_id && (
                          <Link
                            to="/contracts/$contractId"
                            params={{ contractId: r.contract_id }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)] hover:underline"
                          >
                            <FileText className="h-3 w-3" /> {t('con.number')}
                          </Link>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs tnum text-[var(--color-muted)]">
                        {fmt(r.date_start)} → {fmt(r.date_end)}
                        {r.client_name ? ` · ${r.client_name}` : ''}
                      </div>
                    </div>
                    {r.status !== 'cancelled' && !r.is_block && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={cancelling === r.id}
                        onClick={() => cancelOne(r.id)}
                      >
                        <Ban className="h-3.5 w-3.5" /> {t('fleet.cancelBooking')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {activeCount === 0 && (
                <p className="text-xs font-medium text-[var(--color-ok)]">{t('fleet.allCancelled')}</p>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={deleteAll} loading={busy}>
              <Trash2 className="h-4 w-4" />
              {hasLinked ? t('fleet.deleteEverything') : t('fleet.deleteVehicle')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
