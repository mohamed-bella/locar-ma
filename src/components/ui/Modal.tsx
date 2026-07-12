import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

// Centered modal dialog for small focused tasks.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'md' | 'lg'
}) {
  const sizeClass =
    size === 'lg'
      ? 'h-[min(92dvh,860px)] w-[min(96vw,980px)] overflow-hidden rounded-[22px] p-0'
      : 'w-[92vw] max-w-md rounded-2xl p-6'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[6px]" />
        <Dialog.Content
          className={`anim-pop fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 border border-white/70 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.28)] outline-none ${sizeClass}`}
        >
          <div className={size === 'lg' ? 'flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5' : 'flex items-start justify-between gap-4'}>
            <div>
              <Dialog.Title className={size === 'lg' ? 'text-xl font-bold tracking-[-0.02em] text-slate-950' : 'text-lg font-bold text-[var(--color-ink)]'}>{title}</Dialog.Title>
              {description && (
                <Dialog.Description className={size === 'lg' ? 'mt-0.5 text-sm text-slate-500' : 'mt-0.5 text-sm text-[var(--color-muted)]'}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className={size === 'lg' ? 'rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950' : 'rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900'}>
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className={size === 'lg' ? 'h-[calc(100%-77px)] overflow-hidden bg-[#f3f5f7]' : 'mt-5'}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
