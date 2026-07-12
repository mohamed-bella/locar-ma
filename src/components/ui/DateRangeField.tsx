import { useEffect, useState } from 'react'
import { addDays, format, parse, isValid, differenceInCalendarDays } from 'date-fns'
import { CalendarDays, Clock } from 'lucide-react'
import { DateField } from './DateField'
import { cn } from './cn'
import { useI18n } from '~/lib/i18n'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const todayISO = () => iso(new Date())
function toDate(s?: string | null) {
  if (!s) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : undefined
}

const CHIPS = [1, 3, 7, 14]

// Split From / To date fields with quick-duration chips. Emits date_start / date_end.
export function DateRangeField({
  initialStart,
  initialEnd,
  onChange,
}: {
  initialStart?: string | null
  initialEnd?: string | null
  onChange?: (v: { start: string; end: string }) => void
}) {
  const { locale } = useI18n()
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')

  useEffect(() => {
    setStart(initialStart ?? '')
    setEnd(initialEnd ?? '')
  }, [initialStart, initialEnd])

  function emit(s: string, e: string) {
    setStart(s)
    setEnd(e)
    onChange?.({ start: s, end: e })
  }

  function onStart(s: string) {
    // keep end on/after start
    const e = end && s && end < s ? s : end
    emit(s, e)
  }
  function onEnd(e: string) {
    emit(start, e)
  }
  function applyChip(days: number) {
    const s = start || todayISO()
    const sd = toDate(s)!
    emit(s, iso(addDays(sd, days)))
  }

  const nights =
    start && end ? Math.max(1, differenceInCalendarDays(toDate(end)!, toDate(start)!)) : 0

  const labels = locale === 'en'
    ? { start: 'Pickup', end: 'Return', startHint: 'Pickup date', endHint: 'Return date', day: 'day', days: 'days' }
    : locale === 'ar'
      ? { start: 'الانطلاق', end: 'الرجوع', startHint: 'نهار الانطلاق', endHint: 'نهار الرجوع', day: 'نهار', days: 'أيام' }
      : { start: 'Départ', end: 'Retour', startHint: 'Date de départ', endHint: 'Date de retour', day: 'jour', days: 'jours' }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-e border-slate-200 p-3 sm:p-4">
          <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 text-[#1d5b8d]" /> {labels.start}
          </span>
          <DateField name="date_start" value={start} onChange={onStart} placeholder={labels.startHint} />
        </div>
        <div className="p-3 sm:p-4">
          <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <CalendarDays className="h-3.5 w-3.5 text-[#1d5b8d]" /> {labels.end}
          </span>
          <DateField name="date_end" value={end} onChange={onEnd} placeholder={labels.endHint} min={start || undefined} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-xs font-medium text-slate-500">Durée rapide</span>
        {CHIPS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => applyChip(days)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              start && end && differenceInCalendarDays(toDate(end)!, toDate(start)!) === days
                ? 'border-[#1d5b8d] bg-[#1d5b8d] text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#1d5b8d] hover:text-[#1d5b8d]',
            )}
          >
            {days} {days === 1 ? labels.day : labels.days}
          </button>
        ))}
        {nights > 0 && (
          <span className="ms-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#1d5b8d]">
            <Clock className="h-3.5 w-3.5" /> {nights} {nights === 1 ? labels.day : labels.days}
          </span>
        )}
      </div>
    </div>
  )
}
