// Vehicle availability is DERIVED from its bookings — it must never be faked.
//
// Rules (today = server date):
//   • a block covering today            → maintenance
//   • a live booking covering today      → rented
//   • only a future booking             → reserved
//   • nothing upcoming                  → available
// A manual `maintenance` hold is preserved when no booking dictates otherwise.

type Booking = { date_start: string; date_end: string; status: string }

// Pure computation shared by write-sync and read-time display, so the two can
// never diverge. `bookings` must already exclude cancelled/closed and only
// include those still relevant (date_end >= today).
export function deriveVehicleStatus(bookings: Booking[], today: string, stored?: string): string {
  const covers = (r: Booking) => r.date_start <= today && r.date_end >= today
  let next: string
  if (bookings.some((r) => r.status === 'blocked' && covers(r))) next = 'maintenance'
  else if (bookings.some((r) => r.status !== 'blocked' && covers(r))) next = 'rented'
  else if (bookings.some((r) => r.status !== 'blocked' && r.date_start > today)) next = 'reserved'
  else next = 'available'
  // Keep a manual repair hold if no booking is forcing a change.
  if (stored === 'maintenance' && next === 'available') return 'maintenance'
  return next
}

// Recompute and persist a single vehicle's status after a booking mutation.
export async function syncVehicleStatus(supabase: any, vehicleId: string | null | undefined) {
  if (!vehicleId) return
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: v }, { data: rows }] = await Promise.all([
    supabase.from('vehicles').select('status').eq('id', vehicleId).maybeSingle(),
    supabase
      .from('reservations')
      .select('date_start, date_end, status')
      .eq('vehicle_id', vehicleId)
      .neq('status', 'cancelled')
      .neq('status', 'closed')
      .gte('date_end', today),
  ])
  const next = deriveVehicleStatus((rows ?? []) as Booking[], today, (v as any)?.status)
  if ((v as any)?.status !== next) {
    await supabase.from('vehicles').update({ status: next }).eq('id', vehicleId)
  }
}
