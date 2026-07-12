import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import {
  Root as Popover,
  Trigger as PopoverTrigger,
  Portal as PopoverPortal,
  Content as PopoverContent,
} from '@radix-ui/react-popover'
import { format, parse, isValid } from 'date-fns'
import { arMA, enUS, fr } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import 'react-day-picker/style.css'
import { fieldCls } from './Form'
import { cn } from './cn'
import { useI18n } from '~/lib/i18n'

function toDate(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : undefined
}

// Single date picker. Uncontrolled (defaultValue) or controlled (value + onChange).
export function DateField({
  name,
  defaultValue,
  value,
  onChange,
  placeholder = 'Select date',
  min,
}: {
  name?: string
  defaultValue?: string | null
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  min?: string | null
}) {
  const { locale } = useI18n()
  const dateLocale = locale === 'ar' ? arMA : locale === 'fr' ? fr : enUS
  const controlled = value !== undefined
  const [internal, setInternal] = useState<Date | undefined>(toDate(defaultValue))
  const date = controlled ? toDate(value) : internal
  const [open, setOpen] = useState(false)
  const out = date ? format(date, 'yyyy-MM-dd') : ''
  const minDate = toDate(min)

  function update(d: Date | undefined) {
    if (!controlled) setInternal(d)
    onChange?.(d ? format(d, 'yyyy-MM-dd') : '')
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(fieldCls, 'flex items-center justify-between text-left')}>
            <span className={date ? 'text-[var(--color-ink)]' : 'text-[var(--color-faint)]'}>
              {date ? format(date, 'd MMM yyyy', { locale: dateLocale }) : placeholder}
            </span>
            <span className="flex items-center gap-1">
              {date && (
                <X
                  className="h-4 w-4 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
                  onClick={(e) => {
                    e.stopPropagation()
                    update(undefined)
                  }}
                />
              )}
              <CalendarDays className="h-4 w-4 text-[var(--color-faint)]" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="z-50 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-pop)]"
          >
            <DayPicker
              mode="single"
              selected={date}
              onSelect={(d) => {
                update(d)
                setOpen(false)
              }}
              captionLayout="dropdown"
              defaultMonth={date ?? minDate}
              locale={dateLocale}
              weekStartsOn={1}
              disabled={minDate ? { before: minDate } : undefined}
            />
          </PopoverContent>
        </PopoverPortal>
      </Popover>
      {name && <input type="hidden" name={name} value={out} />}
    </>
  )
}
