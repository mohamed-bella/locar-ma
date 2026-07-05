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
    <div className="skeu-card rounded-[var(--radius-card)] border border-[var(--color-line)] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-muted)]">{label}</span>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
            toneCls,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight tnum text-[var(--color-ink)]">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--color-faint)]">{hint}</div>}
    </div>
  )
}
