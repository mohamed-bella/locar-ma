import * as DM from '@radix-ui/react-dropdown-menu'
import { cn } from './cn'
import { useI18n, isRtl } from '~/lib/i18n'

// Thin styled wrapper over Radix dropdown menu.
export function Menu({
  trigger,
  children,
  align = 'end',
}: {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  const { locale } = useI18n()
  return (
    <DM.Root dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-xl border border-[var(--color-line)] bg-white p-1 shadow-[var(--shadow-pop)]"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

export function MenuItem({
  icon: Icon,
  children,
  onSelect,
  danger,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  onSelect?: () => void
  danger?: boolean
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors',
        danger
          ? 'text-[var(--color-danger)] data-[highlighted]:bg-[var(--color-danger-soft)]'
          : 'text-[var(--color-ink-soft)] data-[highlighted]:bg-[var(--color-surface-muted)] data-[highlighted]:text-[var(--color-ink)]',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </DM.Item>
  )
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-[var(--color-line)]" />
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DM.Label className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">
      {children}
    </DM.Label>
  )
}
