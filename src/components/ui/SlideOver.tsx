import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

// Right slide-over on desktop, bottom sheet on mobile.
export function SlideOver({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content
          className="anim-sheet fixed z-50 flex flex-col bg-[var(--color-canvas)] shadow-[var(--shadow-pop)]
            inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl
            sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-none sm:w-[540px] sm:rounded-none sm:rounded-l-3xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] bg-white px-5 py-4 sm:rounded-tl-3xl">
            <div>
              <Dialog.Title className="text-lg font-bold text-[var(--color-ink)]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-black/5">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && (
            <div className="border-t border-[var(--color-line)] bg-white px-5 py-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
