import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInCalendarDays, format, isSameMonth, isWeekend } from 'date-fns'
import { Car, Plus, X, CalendarCheck } from 'lucide-react'
import type { Reservation } from '~/server/reservations'
import { RES_BAR_STYLE, reservationLabel } from '~/lib/reservations'
import { cn, Button } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import type { VehicleOption } from './ReservationDrawer'

// Layout constants (px).
const CELL = 46
const NAME_W = 208
const ROW_H = 68

const STATUS_DOT: Record<string, string> = {
  available: 'bg-[var(--color-ok)]',
  rented: 'bg-[var(--color-info)]',
  reserved: 'bg-amber-500',
  maintenance: 'bg-[var(--color-danger)]',
}

type Cell = { vehicleId: string; idx: number }

// A from-scratch resource timeline: cars as rows (photo + brand), days as
// columns, bookings as bars. Drag across empty days to create; click a bar to
// open it. No external calendar library.
export function PlanningCalendar({
  vehicles,
  reservations,
  windowStart,
  days,
  onCreateRange,
  onOpenReservation,
}: {
  vehicles: VehicleOption[]
  reservations: Reservation[]
  windowStart: Date
  days: number
  onCreateRange: (vehicleId: string, startISO: string, endISO: string) => void
  onOpenReservation: (r: Reservation) => void
}) {
  const { t } = useI18n()
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(windowStart, i)), [windowStart, days])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Compute "today" client-side to dodge SSR/timezone drift.
  const [todayStr, setTodayStr] = useState('')
  useEffect(() => setTodayStr(format(new Date(), 'yyyy-MM-dd')), [])

  const [drag, setDrag] = useState<{ vehicleId: string; a: number; b: number } | null>(null)
  const [pending, setPending] = useState<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const dragRef = useRef(drag)
  const movedRef = useRef(false)
  const pendingRef = useRef(pending)
  dragRef.current = drag
  pendingRef.current = pending

  const iso = (idx: number) => format(addDays(windowStart, idx), 'yyyy-MM-dd')
  const commit = (vehicleId: string, i: number, j: number) =>
    onCreateRange(vehicleId, iso(Math.min(i, j)), iso(Math.max(i, j)))

  // Center today near the left edge on load.
  useEffect(() => {
    const idx = differenceInCalendarDays(new Date(), windowStart)
    if (scrollRef.current && idx >= 0 && idx < days) {
      scrollRef.current.scrollLeft = Math.max(0, (idx - 2) * CELL)
    }
  }, [windowStart, days])

  // Escape cancels a pending two-tap selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPending(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onPointerDownCell(vehicleId: string, i: number, e: React.PointerEvent) {
    e.preventDefault()
    setDrag({ vehicleId, a: i, b: i })
    movedRef.current = false
  }
  function onPointerEnterCell(vehicleId: string, i: number) {
    setHover({ vehicleId, idx: i })
    if (dragRef.current?.vehicleId === vehicleId) {
      setDrag((d) => (d ? { ...d, b: i } : d))
      movedRef.current = true
    }
  }
  function onPointerUp() {
    const d = dragRef.current
    if (d) {
      if (movedRef.current) {
        commit(d.vehicleId, d.a, d.b)
        setPending(null)
      } else {
        const p = pendingRef.current
        if (p && p.vehicleId === d.vehicleId) {
          commit(p.vehicleId, p.idx, d.a)
          setPending(null)
        } else {
          setPending({ vehicleId: d.vehicleId, idx: d.a })
        }
      }
    }
    setDrag(null)
  }

  function cellSelected(vehicleId: string, i: number) {
    if (drag?.vehicleId === vehicleId && i >= Math.min(drag.a, drag.b) && i <= Math.max(drag.a, drag.b)) return true
    if (pending?.vehicleId === vehicleId) {
      if (hover?.vehicleId === vehicleId) {
        const lo = Math.min(pending.idx, hover.idx)
        const hi = Math.max(pending.idx, hover.idx)
        if (i >= lo && i <= hi) return true
      }
      if (i === pending.idx) return true
    }
    return false
  }

  function barGeometry(r: Reservation) {
    const s = differenceInCalendarDays(new Date(`${r.date_start}T00:00:00`), windowStart)
    const e = differenceInCalendarDays(new Date(`${r.date_end}T00:00:00`), windowStart)
    const lo = Math.max(0, s)
    const hi = Math.min(days - 1, e)
    if (hi < 0 || lo > days - 1) return null
    return { left: lo * CELL, width: (hi - lo + 1) * CELL, clipLeft: s < 0, clipRight: e > days - 1 }
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]"
        onPointerUp={onPointerUp}
        onPointerLeave={() => dragRef.current && onPointerUp()}
      >
        <div style={{ width: NAME_W + days * CELL, minWidth: '100%' }}>
          {/* Day header */}
          <div className="flex border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]/40">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-[var(--color-line)] bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]"
              style={{ width: NAME_W }}
            >
              {t('common.vehicle')}
            </div>
            {dayList.map((d, i) => {
              const isTod = format(d, 'yyyy-MM-dd') === todayStr
              const firstOfMonth = i === 0 || !isSameMonth(d, dayList[i - 1])
              return (
                <div
                  key={i}
                  className={cn(
                    'relative shrink-0 border-r border-[var(--color-line)] py-1.5 text-center last:border-r-0',
                    isWeekend(d) && 'bg-[var(--color-surface-muted)]',
                    isTod && 'bg-[var(--color-brand-soft)]',
                  )}
                  style={{ width: CELL }}
                >
                  {firstOfMonth && (
                    <span className="absolute left-1 top-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-brand)]">
                      {format(d, 'MMM')}
                    </span>
                  )}
                  <div className={cn('text-[10px] font-semibold uppercase', isTod ? 'text-[var(--color-brand)]' : 'text-[var(--color-faint)]')}>
                    {format(d, 'EEEEE')}
                  </div>
                  <div
                    className={cn(
                      'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold',
                      isTod ? 'bg-[var(--color-brand)] text-white shadow-sm' : 'text-[var(--color-ink-soft)]',
                    )}
                  >
                    {format(d, 'd')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Vehicle rows */}
          {vehicles.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">{t('res.tlAddVehicles')}</div>
          )}
          {vehicles.map((v) => {
            const rows = reservations.filter((r) => r.vehicle_id === v.id)
            return (
              <div key={v.id} className="flex border-b border-[var(--color-line)] last:border-b-0 hover:bg-[var(--color-surface-muted)]/20">
                {/* Car identity (sticky) */}
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-[var(--color-line)] bg-white px-3"
                  style={{ width: NAME_W }}
                >
                  <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
                    {v.image_url ? (
                      <img src={v.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Car className="h-4 w-4 text-[var(--color-faint)]" />
                      </div>
                    )}
                    {v.status && (
                      <span
                        className={cn(
                          'absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white',
                          STATUS_DOT[v.status] ?? 'bg-[var(--color-faint)]',
                        )}
                        title={t(`status.${v.status}`)}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[var(--color-ink)]">{v.plate}</div>
                    {v.brand && <div className="truncate text-xs text-[var(--color-muted)]">{v.brand}</div>}
                    <div className="truncate text-[11px] font-semibold tnum text-[var(--color-faint)]">
                      {v.daily_rate.toLocaleString()} {t('res.perDayShort')}
                    </div>
                  </div>
                </div>

                {/* Day grid + bars */}
                <div className="relative" style={{ width: days * CELL, height: ROW_H }}>
                  <div className="absolute inset-0 flex">
                    {dayList.map((d, i) => {
                      const sel = cellSelected(v.id, i)
                      const isTod = format(d, 'yyyy-MM-dd') === todayStr
                      const isAnchor = pending?.vehicleId === v.id && pending.idx === i
                      return (
                        <div
                          key={i}
                          onPointerDown={(e) => onPointerDownCell(v.id, i, e)}
                          onPointerEnter={() => onPointerEnterCell(v.id, i)}
                          className={cn(
                            'group relative shrink-0 cursor-cell border-r border-[var(--color-line)] last:border-r-0',
                            isWeekend(d) && !sel && 'bg-[var(--color-surface-muted)]/40',
                            isTod && !sel && 'bg-[var(--color-brand-soft)]/40',
                            sel && 'bg-[var(--color-brand-soft)]',
                          )}
                          style={{ width: CELL }}
                        >
                          {isAnchor && (
                            <span className="absolute inset-x-1 top-1 rounded bg-[var(--color-brand)] py-0.5 text-center text-[9px] font-bold uppercase text-white">
                              {t('res.tlStart')}
                            </span>
                          )}
                          {!sel && (
                            <Plus className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-[var(--color-line-strong)] opacity-0 transition group-hover:opacity-100" />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {rows.map((r) => {
                    const g = barGeometry(r)
                    if (!g) return null
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onOpenReservation(r)}
                        title={reservationLabel(r)}
                        className={cn(
                          'absolute top-1/2 flex h-9 -translate-y-1/2 items-center gap-1 overflow-hidden px-2 text-xs font-semibold shadow-sm transition hover:brightness-105 hover:shadow-md',
                          RES_BAR_STYLE[r.status] ?? RES_BAR_STYLE.confirmed,
                          g.clipLeft ? 'rounded-l-none' : 'rounded-l-lg',
                          g.clipRight ? 'rounded-r-none' : 'rounded-r-lg',
                        )}
                        style={{ left: g.left + 2, width: g.width - 4 }}
                      >
                        <span className="truncate">{reservationLabel(r)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Two-tap selection helper */}
      {pending && (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3 shadow-[var(--shadow-pop)]">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
              <CalendarCheck className="h-4 w-4 text-[var(--color-brand)]" />
              {t('res.tlStartHelper', { date: format(addDays(windowStart, pending.idx), 'd MMM') })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                commit(pending.vehicleId, pending.idx, pending.idx)
                setPending(null)
              }}
            >
              {t('res.tlJustThisDay')}
            </Button>
            <button
              onClick={() => setPending(null)}
              className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-black/5"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
