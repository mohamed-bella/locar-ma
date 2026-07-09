import { createServerFn } from '@tanstack/react-start'
import { requireAgencyContext } from './context'

export type NavCounts = {
  fleet: number
  reservations: number
  contracts: number
  clients: number
}

// Cheap head-only counts (no rows fetched) for the sidebar badges. RLS scopes
// every query to the caller's agency already; count() just avoids pulling data.
export const getNavCounts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<NavCounts> => {
    const { supabase } = await requireAgencyContext()
    const [vehicles, reservations, contracts, clients] = await Promise.all([
      supabase.from('vehicles').select('id', { count: 'exact', head: true }),
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(cancelled,closed,blocked)'),
      supabase.from('contracts').select('id', { count: 'exact', head: true }).is('closed_at', null),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
    ])
    return {
      fleet: vehicles.count ?? 0,
      reservations: reservations.count ?? 0,
      contracts: contracts.count ?? 0,
      clients: clients.count ?? 0,
    }
  },
)
