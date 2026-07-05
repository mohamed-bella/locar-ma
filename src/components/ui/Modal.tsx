import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

// Centered modal dialog for small focused tasks.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="anim-pop fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-pop)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-[var(--color-ink)]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-black/5">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
