import { useState } from 'react'
import { addDays, format, parse, isValid, differenceInCalendarDays } from 'date-fns'
import { DateField } from './DateField'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const todayISO = () => iso(new Date())
function toDate(s?: string | null) {
  if (!s) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : undefined
}

const CHIPS = [
  { label: '1 day', nights: 0 },
  { label: '3 days', nights: 2 },
  { label: '1 week', nights: 6 },
  { label: '2 weeks', nights: 13 },
]

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
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')

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
  function applyChip(nights: number) {
    const s = start || todayISO()
    const sd = toDate(s)!
    emit(s, iso(addDays(sd, nights)))
  }

  const nights =
    start && end ? Math.max(1, differenceInCalendarDays(toDate(end)!, toDate(start)!)) : 0

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => applyChip(c.nights)}
            className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">From</span>
          <DateField name="date_start" value={start} onChange={onStart} placeholder="Start day" />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">To</span>
          <DateField name="date_end" value={end} onChange={onEnd} placeholder="End day" min={start || undefined} />
        </div>
      </div>

      {nights > 0 && (
        <p className="mt-2 text-xs text-[var(--color-faint)]">
          {nights} day{nights === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}
