import { forwardRef } from 'react'
import { cn } from './cn'

export const fieldCls =
  'skeu-field h-11 w-full rounded-lg border border-[var(--color-line-strong)] px-3.5 text-sm ' +
  'text-[var(--color-ink)] placeholder:text-[var(--color-faint)] outline-none transition ' +
  'focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand-soft)]'

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--color-ink-soft)]">
      {children}
    </label>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && (
        <Label>
          {label}
          {required && <span className="ml-0.5 text-[var(--color-brand)]">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--color-faint)]">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldCls, className)} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldCls, 'h-auto py-2.5 leading-relaxed', className)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(fieldCls, 'appearance-none pr-9', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    )
  },
)
