// Single source of truth for a vehicle's odometer.
//
// The odometer is learned from many events — a logged service, a quick check, a
// returned rental. Each used to carry its own copy of "update if the reading is
// newer". That drift is exactly how a km entered in one place fails to show in
// another. Every such path now funnels through here, so the rule lives ONCE:
// mileage only ever moves forward.
//
// The ONLY exception is an explicit manual correction (updateOdometer), which is
// allowed to set any value on purpose.
export async function advanceVehicleMileage(
  supabase: any,
  vehicleId: string | null | undefined,
  km: number | null | undefined,
): Promise<void> {
  if (!vehicleId || km == null) return
  const { data: v } = await supabase.from('vehicles').select('mileage_current').eq('id', vehicleId).maybeSingle()
  const cur = (v as any)?.mileage_current
  if (cur == null || km > cur) {
    await supabase.from('vehicles').update({ mileage_current: km }).eq('id', vehicleId)
  }
}
