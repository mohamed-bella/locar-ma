import { createServerFn } from '@tanstack/react-start'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { requireAgencyContext } from './context'

export type VehicleRevenue = { vehicle_id: string; plate: string; total: number; count: number }
export type BookingRow = {
  id: string
  date_start: string
  date_end: string
  status: string
  total_amount: number | null
  vehicle_plate: string | null
  client_name: string | null
}

export type FinanceSummary = {
  revToday: number
  revWeek: number
  revMonth: number
  revTotal: number
  perVehicle: VehicleRevenue[]
  upcoming: BookingRow[]
  overdue: BookingRow[]
}

async function fetchBookings() {
  const { supabase } = await requireAgencyContext()
  const { data, error } = await supabase
    .from('reservations')
    .select('id, date_start, date_end, status, total_amount, vehicle_id, vehicles(plate), clients(full_name)')
    .neq('status', 'cancelled')
    .neq('status', 'blocked')
    .order('date_start')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    date_start: r.date_start,
    date_end: r.date_end,
    status: r.status,
    total_amount: r.total_amount ?? null,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicles?.plate ?? null,
    client_name: r.clients?.full_name ?? null,
  }))
}

export const getFinanceSummary = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FinanceSummary> => {
    const rows = await fetchBookings()
    const now = new Date()
    const todayStr = format(now, 'yyyy-MM-dd')
    const wkS = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const wkE = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const moS = format(startOfMonth(now), 'yyyy-MM-dd')
    const moE = format(endOfMonth(now), 'yyyy-MM-dd')

    let revToday = 0
    let revWeek = 0
    let revMonth = 0
    let revTotal = 0
    const perVehicle = new Map<string, VehicleRevenue>()
    const upcoming: BookingRow[] = []
    const overdue: BookingRow[] = []

    for (const r of rows) {
      const amt = r.total_amount ?? 0
      // Pending = not yet committed → not revenue. Count confirmed/active/closed.
      const counts = r.status !== 'pending'
      if (counts) {
        revTotal += amt
        if (r.date_start === todayStr) revToday += amt
        if (r.date_start >= wkS && r.date_start <= wkE) revWeek += amt
        if (r.date_start >= moS && r.date_start <= moE) revMonth += amt

        if (r.vehicle_id) {
          const v = perVehicle.get(r.vehicle_id) ?? {
            vehicle_id: r.vehicle_id,
            plate: r.vehicle_plate ?? '—',
            total: 0,
            count: 0,
          }
          v.total += amt
          v.count += 1
          perVehicle.set(r.vehicle_id, v)
        }
      }

      const row: BookingRow = {
        id: r.id,
        date_start: r.date_start,
        date_end: r.date_end,
        status: r.status,
        total_amount: r.total_amount,
        vehicle_plate: r.vehicle_plate,
        client_name: r.client_name,
      }
      if ((r.status === 'confirmed' || r.status === 'active') && r.date_end >= todayStr) upcoming.push(row)
      // Any non-closed booking past its return date needs attention (car out / no-show).
      if ((r.status === 'active' || r.status === 'confirmed') && r.date_end < todayStr) overdue.push(row)
    }

    return {
      revToday,
      revWeek,
      revMonth,
      revTotal,
      perVehicle: [...perVehicle.values()].sort((a, b) => b.total - a.total),
      upcoming: upcoming.sort((a, b) => a.date_end.localeCompare(b.date_end)).slice(0, 8),
      overdue,
    }
  },
)

// CSV of all bookings — accountant-ready.
export const exportBookingsCsv = createServerFn({ method: 'GET' }).handler(async (): Promise<string> => {
  const rows = await fetchBookings()
  const head = ['Start', 'End', 'Vehicle', 'Client', 'Status', 'Total (MAD)']
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.date_start, r.date_end, r.vehicle_plate, r.client_name, r.status, r.total_amount ?? 0].map(esc).join(','),
  )
  return [head.map(esc).join(','), ...lines].join('\n')
})
