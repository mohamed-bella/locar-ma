import { createServerFn } from '@tanstack/react-start'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { requireAgencyContext } from './context'

export type DashboardStats = {
  returnsToday: number
  pickupsToday: number
  revMonth: number
}

// Today's returns/pickups + this month's committed revenue for the déchéances
// centre. One cheap query.
export const getDashboardStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardStats> => {
    const { supabase } = await requireAgencyContext()
    const today = format(new Date(), 'yyyy-MM-dd')
    const moS = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const moE = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('reservations')
      .select('date_start, date_end, status, total_amount')
      .neq('status', 'cancelled')
      .neq('status', 'blocked')
    if (error) throw new Error(error.message)

    let returnsToday = 0
    let pickupsToday = 0
    let revMonth = 0
    for (const r of (data ?? []) as any[]) {
      const live = r.status === 'confirmed' || r.status === 'active'
      if (live && r.date_end === today) returnsToday++
      if (live && r.date_start === today) pickupsToday++
      if (r.status !== 'pending' && r.date_start >= moS && r.date_start <= moE) revMonth += r.total_amount ?? 0
    }
    return { returnsToday, pickupsToday, revMonth }
  },
)
