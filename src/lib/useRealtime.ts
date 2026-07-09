import { useEffect } from 'react'
import { useRouter, useRouteContext } from '@tanstack/react-router'
import { getSupabaseBrowserClient } from './supabase'

// Subscribe to Postgres changes on a table and re-run route loaders on change.
//
// Tenant safety: postgres_changes runs every change through the subscribing
// user's RLS SELECT policy, so a client only ever receives rows for its own
// agency. On top of that we ALWAYS scope the subscription to the caller's
// agency_id (unless an explicit narrower filter is passed) — defense in depth
// and far less cross-tenant channel noise. Requires Realtime replication
// enabled for the table (see migration 0010).
export function useRealtimeInvalidate(table: string, filter?: string) {
  const router = useRouter()
  // Pull the current agency from the nearest _app route context. strict:false
  // returns the merged context without throwing for routes outside _app.
  const ctx = useRouteContext({ strict: false }) as any
  const agencyId: string | undefined = ctx?.agency?.agency_id
  const effectiveFilter = filter ?? (agencyId ? `agency_id=eq.${agencyId}` : undefined)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    // Append a unique suffix to the channel name to avoid cached channel conflicts
    // between concurrent mounts/StrictMode double-mounts.
    const channelId = Math.random().toString(36).substring(2, 9)
    const channel = supabase
      .channel(`rt:${table}:${effectiveFilter ?? 'all'}:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(effectiveFilter ? { filter: effectiveFilter } : {}) },
        () => {
          void router.invalidate()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, effectiveFilter, router])
}
