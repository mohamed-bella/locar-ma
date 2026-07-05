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
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
