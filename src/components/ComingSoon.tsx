import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '~/components/ui'

export function ComingSoon({
  title,
  phase,
  icon: Icon,
  points,
}: {
  title: string
  phase: string
  icon: LucideIcon
  points: string[]
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={phase} />
      <div className="mt-6 flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] bg-white px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-[var(--color-ink)]">Coming in {phase}</h3>
        <ul className="mt-4 space-y-1.5 text-sm text-[var(--color-muted)]">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
