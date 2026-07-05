import { cn } from './cn'

type Tone = 'neutral' | 'ok' | 'info' | 'warn' | 'danger' | 'brand'

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)] border-[var(--color-line-strong)]',
  ok: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-transparent',
  info: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-transparent',
  warn: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-transparent',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-transparent',
  brand: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-transparent',
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// Vehicle status → tone mapping
export function statusTone(status: string): Tone {
  switch (status) {
    case 'available':
      return 'ok'
    case 'rented':
      return 'info'
    case 'reserved':
      return 'warn'
    case 'maintenance':
      return 'danger'
    default:
      return 'neutral'
  }
}
