import type { OpStatus } from '~/lib/intelligence'
import { useI18n } from '~/lib/i18n'
import { cn } from '~/components/ui'
import { PngIcon, statusIconPath } from './Icon'

// Minimal verdict chip: colored PNG icon + neutral word. No colored background —
// the icon carries the signal, keeping the page calm and scannable.
export function StatusPill({ status, className }: { status: OpStatus; className?: string }) {
  const { t } = useI18n()
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-soft)]', className)}>
      <PngIcon path={statusIconPath(status)} size={18} />
      {t(`si.status.${status}`)}
    </span>
  )
}
