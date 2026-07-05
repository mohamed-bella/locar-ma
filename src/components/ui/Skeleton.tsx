import { cn } from './cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-[linear-gradient(90deg,#eef0f3_25%,#e4e7eb_50%,#eef0f3_75%)] bg-[length:200%_100%]',
        className,
      )}
      style={{ animation: 'shimmer 1.4s ease-in-out infinite' }}
    />
  )
}

// Table skeleton for list loading states.
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-card)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3.5">
          <Skeleton className="h-10 w-14 rounded-lg" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
