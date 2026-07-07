import './sentry.browser' // Sentry browser init (window-guarded)
import './pwa.browser' // registers the service worker (window-guarded)
import { createRouter } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { routeTree } from './routeTree.gen'

function DefaultPending() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
    </div>
  )
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Cache intent-preloaded loader data briefly so hovering a link twice (or
    // navigating back within a few seconds) reuses it instead of refetching.
    // Realtime + explicit router.invalidate() still refresh on real changes.
    defaultPreloadStaleTime: 10_000,
    // Stale-while-revalidate: a route revisited within this window paints
    // INSTANTLY from cache (no loader wait, no spinner) — the app "feels like it
    // remembers". Freshness is still guaranteed by realtime subscriptions and the
    // explicit router.invalidate() every mutation already fires.
    defaultStaleTime: 30_000,
    // Psychology of waiting:
    //  • <150ms load → show nothing (reads as instant, no anxiety-inducing flash)
    //  • once a skeleton shows, keep it ≥400ms so it never flickers in-and-out
    //    (a flash reads as "broken/slow", a brief hold reads as "working").
    defaultPendingComponent: DefaultPending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
