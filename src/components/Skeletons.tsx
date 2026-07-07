import { Skeleton } from '~/components/ui'

// Page-shaped loading states. A skeleton that mirrors the real layout reads as
// "the page is almost here" — the brain sees structure and fills in the rest —
// whereas a centered spinner reads as "nothing is happening yet". Shown only
// after 150ms (router defaultPendingMs), so fast loads never flash a skeleton.

function Bar({ w = 'w-24', h = 'h-4' }: { w?: string; h?: string }) {
  return <Skeleton className={`${h} ${w}`} />
}

// ── /suivi grid ──
export function SuiviGridSkeleton() {
  return (
    <div>
      <div className="space-y-2">
        <Bar w="w-48" h="h-7" />
        <Bar w="w-64" h="h-4" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Bar w="w-32" />
                <Bar w="w-20" h="h-3" />
              </div>
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
            <div className="mt-3 space-y-2">
              <Bar w="w-24" />
              <Bar w="w-40" h="h-3" />
            </div>
            <Skeleton className="mt-3 h-9 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── /dashboard ──
export function DashboardSkeleton() {
  return (
    <div>
      <div className="space-y-2">
        <Bar w="w-56" h="h-7" />
        <Bar w="w-72" h="h-4" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-[var(--color-line)] bg-white p-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Bar w="w-12" h="h-6" />
            <Bar w="w-20" h="h-3" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
            <Bar w="w-32" h="h-5" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Bar w="w-40" />
                  <Skeleton className="ms-auto h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
