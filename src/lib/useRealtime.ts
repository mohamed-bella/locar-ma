import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { getSupabaseBrowserClient } from './supabase'

// Subscribe to Postgres changes on a table and re-run route loaders on change.
// Requires Realtime replication enabled for the table in Supabase.
export function useRealtimeInvalidate(table: string, filter?: string) {
  const router = useRouter()
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          void router.invalidate()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, filter, router])
}
