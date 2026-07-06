import { useState } from 'react'
import { format } from 'date-fns'
import { Car, Ban, ChevronDown, Pencil, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { checkAvailability, type AvailabilityRow, type Reservation } from '~/server/reservations'
import { reservationLabel, resBadgeTone } from '~/lib/reservations'
import { SlideOver, Button, Badge, cn } from '~/components/ui'
import { DateRangeField } from '~/components/ui/DateRangeField'
import { useI18n } from '~/lib/i18n'

export function AvailabilityChecker({
  open,
  onOpenChange,
  defaultStart,
  defaultEnd,
  onBook,
  onEdit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultStart?: string
  defaultEnd?: string
  onBook: (vehicleId: string, from: string, to: string) => void
  onEdit: (r: Reservation) => void
}) {
  const { t } = useI18n()
  const [start, setStart] = useState(defaultStart ?? '')
  const [end, setEnd] = useState(defaultEnd ?? '')
  const [rows, setRows] = useState<AvailabilityRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function run() {
    if (!start || !end) {
      toast.error(t('res.pickDatesFirst'))
      return
    }
    setBusy(true)
    try {
      setRows(await checkAvailability({ data: { from: start, to: end } }))
    } catch (err: any) {
      toast.error(err?.message ?? t('res.couldNotCheck'))
    } finally {
      setBusy(false)
    }
  }

  const availableCount = rows?.filter((r) => r.available).length ?? 0
  const sorted = rows ? [...rows].sort((a, b) => Number(b.available) - Number(a.available)) : null

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={t('res.checkAvailability')}
      description={t('res.availDesc')}
    >
      <div className="space-y-4">
        <DateRangeField
          initialStart={defaultStart}
          initialEnd={defaultEnd}
          onChange={({ start: s, end: e }) => {
            setStart(s)
            setEnd(e)
          }}
        />
        <Button className="w-full" size="lg" loading={busy} onClick={run}>
          {t('res.checkAvailability')}
        </Button>

        {sorted && (
          <div className="flex items-center gap-2 pt-1 text-sm">
            <Badge tone="ok" dot>
              {t('res.availableCount', { n: availableCount })}
            </Badge>
            <Badge tone="danger" dot>
              {t('res.bookedCount', { n: sorted.length - availableCount })}
            </Badge>
            <span className="text-[var(--color-faint)]">
              {start && end ? `${format(new Date(start), 'd MMM')} → ${format(new Date(end), 'd MMM')}` : ''}
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {sorted?.map((row) => (
            <VehicleAvailabilityCard
              key={row.vehicle.id}
              row={row}
              expanded={expanded === row.vehicle.id}
              onToggle={() => setExpanded((e) => (e === row.vehicle.id ? null : row.vehicle.id))}
              onBook={() => {
                onBook(row.vehicle.id, start, end)
                onOpenChange(false)
              }}
              onEdit={(r) => {
                onEdit(r)
                onOpenChange(false)
              }}
            />
          ))}
        </div>
      </div>
    </SlideOver>
  )
}

function VehicleAvailabilityCard({
  row,
  expanded,
  onToggle,
  onBook,
  onEdit,
}: {
  row: AvailabilityRow
  expanded: boolean
  onToggle: () => void
  onBook: () => void
  onEdit: (r: Reservation) => void
}) {
  const { t } = useI18n()
  const { vehicle, available, conflicts } = row
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border transition',
        available
          ? 'border-[var(--color-ok)]/40 bg-[var(--color-ok-soft)]/40'
          : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/30',
      )}
    >
      <button
        type="button"
        onClick={available ? onBook : onToggle}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
          {vehicle.image_url ? (
            <img src={vehicle.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <Car className="h-6 w-6 text-[var(--color-faint)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[var(--color-ink)]">{vehicle.plate}</span>
            {vehicle.brand_logo_url && (
              <img src={vehicle.brand_logo_url} alt="" className="h-4 w-4 rounded object-contain" />
            )}
          </div>
          <div className="text-xs text-[var(--color-muted)]">
            {vehicle.brand ?? '—'} · {vehicle.daily_rate.toLocaleString()} {t('res.perDayShort')}
          </div>
        </div>
        {available ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-ok)] px-3 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5" /> {t('res.book')}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-semibold text-[var(--color-danger)]">
            <Ban className="h-3.5 w-3.5" /> {t('res.booked')}
            <ChevronDown className={cn('h-4 w-4 transition', expanded && 'rotate-180')} />
          </span>
        )}
      </button>

      {!available && expanded && (
        <div className="space-y-2 border-t border-[var(--color-danger)]/20 bg-white/60 p-3">
          {conflicts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                  {reservationLabel(c)}
                  <Badge tone={resBadgeTone(c.status)}>{c.is_block ? t('res.blocked') : t(`rstatus.${c.status}`)}</Badge>
                </div>
                <div className="text-xs text-[var(--color-muted)]">
                  {format(new Date(`${c.date_start}T00:00:00`), 'd MMM')} →{' '}
                  {format(new Date(`${c.date_end}T00:00:00`), 'd MMM yyyy')}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onEdit(c)}>
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
