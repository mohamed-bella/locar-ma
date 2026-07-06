import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  tone?: 'brand' | 'ok' | 'info' | 'warn'
}) {
  const toneCls = {
    brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
    ok: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
    info: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    warn: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  }[tone]

  return (
    <div className="skeu-card rounded-[var(--radius-card)] border border-[var(--color-line)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="truncate text-xs sm:text-sm font-medium text-[var(--color-muted)]">{label}</span>
        <span
          className={cn(
            'flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
            toneCls,
          )}
        >
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </span>
      </div>
      <div className="mt-2.5 sm:mt-3 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight tnum text-[var(--color-ink)] truncate" title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] sm:text-xs text-[var(--color-faint)] truncate">{hint}</div>}
    </div>
  )
}
