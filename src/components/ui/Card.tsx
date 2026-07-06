import { cn } from './cn'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'skeu-card rounded-[var(--radius-card)] border border-[var(--color-line)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode
  /** Deprecated: headers show a single title only. */
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-t-[var(--radius-card)] bg-[#1d5b8d] px-5 py-3.5 text-white',
        className,
      )}
    >
      <h3 className="font-bold tracking-tight text-white [&_*]:text-white">{title}</h3>
      {action}
    </div>
  )
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}
