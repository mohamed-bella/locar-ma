import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { agencyToday } from '~/lib/tz'

// Free per-vehicle expenses (name + amount + date). Anything not on a maintenance
// schedule: wash, fine, ad-hoc repair, accessory…
export type VehicleExpense = {
  id: string
  vehicle_id: string
  name: string
  amount: number
  spent_at: string
  created_at: string
}

export const listVehicleExpenses = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<VehicleExpense[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('vehicle_expenses')
      .select('*')
      .eq('vehicle_id', data.vehicle_id)
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (rows ?? []) as unknown as VehicleExpense[]
  })

export const addExpense = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        vehicle_id: z.string().uuid(),
        name: z.string().min(1),
        amount: z.coerce.number().min(0),
        spent_at: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().optional()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()
    const { error } = await supabase.from('vehicle_expenses').insert({
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      name: data.name,
      amount: data.amount,
      spent_at: data.spent_at ?? agencyToday(),
      created_by: memberId,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const deleteExpense = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase.from('vehicle_expenses').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
