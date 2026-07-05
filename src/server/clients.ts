import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { clientQuickSchema, clientSchema, clientStatusSchema } from '~/lib/schemas'

export type Client = {
  id: string
  full_name: string
  phone: string | null
  cin_passport: string | null
  email: string | null
  nationality: string | null
  address: string | null
  status: string
  blacklist_reason: string | null
  blacklist_date: string | null
}

const CLIENT_COLS =
  'id, full_name, phone, cin_passport, email, nationality, address, status, blacklist_reason, blacklist_date'

export const listClients = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Client[]> => {
    const { supabase } = await requireAgencyContext()
    const { data, error } = await supabase.from('clients').select(CLIENT_COLS).order('full_name')
    if (error) throw new Error(error.message)
    return (data ?? []) as Client[]
  },
)

export type ClientHistoryRow = {
  id: string
  date_start: string
  date_end: string
  status: string
  total_amount: number | null
  vehicle_plate: string | null
}

export const getClient = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ client: Client; history: ClientHistoryRow[] } | null> => {
    const { supabase } = await requireAgencyContext()
    const { data: client, error } = await supabase
      .from('clients')
      .select(CLIENT_COLS)
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!client) return null

    const { data: res } = await supabase
      .from('reservations')
      .select('id, date_start, date_end, status, total_amount, vehicles(plate)')
      .eq('client_id', data.id)
      .neq('status', 'blocked')
      .order('date_start', { ascending: false })

    const history: ClientHistoryRow[] = (res ?? []).map((r: any) => ({
      id: r.id,
      date_start: r.date_start,
      date_end: r.date_end,
      status: r.status,
      total_amount: r.total_amount ?? null,
      vehicle_plate: r.vehicles?.plate ?? null,
    }))
    return { client: client as Client, history }
  })

// Blacklist / flag matches by CIN — used on client creation (Flow 4).
export const checkBlacklist = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ cin: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<Client[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows } = await supabase
      .from('clients')
      .select(CLIENT_COLS)
      .eq('cin_passport', data.cin.trim())
      .in('status', ['flagged', 'blacklisted'])
    return (rows ?? []) as Client[]
  })

export const createClient = createServerFn({ method: 'POST' })
  .validator((d: unknown) => clientQuickSchema.parse(d))
  .handler(async ({ data }): Promise<Client> => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('clients')
      .insert({
        agency_id: agencyId,
        full_name: data.full_name.trim(),
        phone: data.phone ?? null,
        cin_passport: data.cin_passport ?? null,
        nationality: data.nationality ?? null,
      })
      .select(CLIENT_COLS)
      .single()
    if (error) throw new Error(error.message)
    return row as Client
  })

export const updateClient = createServerFn({ method: 'POST' })
  .validator((d: unknown) => clientSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { id, ...rest } = data
    const { error } = await supabase
      .from('clients')
      .update({
        full_name: rest.full_name.trim(),
        cin_passport: rest.cin_passport ?? null,
        phone: rest.phone ?? null,
        email: rest.email ?? null,
        nationality: rest.nationality ?? null,
        address: rest.address ?? null,
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const setClientStatus = createServerFn({ method: 'POST' })
  .validator((d: unknown) => clientStatusSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, memberId } = await requireAgencyContext()
    const flagged = data.status !== 'active'
    const { error } = await supabase
      .from('clients')
      .update({
        status: data.status,
        blacklist_reason: flagged ? data.reason ?? null : null,
        blacklist_date: flagged ? new Date().toISOString().slice(0, 10) : null,
        blacklisted_by: flagged ? memberId : null,
      })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
