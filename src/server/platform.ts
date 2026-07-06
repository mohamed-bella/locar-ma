import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupabaseServerClient, getSupabaseAdminClient } from '~/lib/supabase.server'
import { agencyToday } from '~/lib/tz'

// ── Access control ─────────────────────────────────────
// The service-role client bypasses RLS, so EVERY platform fn must first prove
// the caller is a registered platform admin.
async function requirePlatformAdmin(): Promise<{ admin: any; userId: string }> {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getSupabaseAdminClient() as any
  const { data } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!data) throw new Error('Not authorized')
  return { admin, userId: user.id }
}

// Resolve an existing auth user by email. listUsers() has no email filter and
// is paginated (default 50/page) — a single-page scan silently fails to find
// anyone past the first page. Page through until found or exhausted.
async function findUserByEmail(admin: any, email: string): Promise<{ id: string } | null> {
  const target = email.trim().toLowerCase()
  const perPage = 200
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    const users = data?.users ?? []
    const found = users.find((u: any) => u.email?.toLowerCase() === target)
    if (found) return found
    if (users.length < perPage) return null // last page reached
  }
  return null
}

// Boolean check for gating UI (never throws).
export const getIsPlatformAdmin = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  try {
    await requirePlatformAdmin()
    return true
  } catch {
    return false
  }
})

// ── Types ──────────────────────────────────────────────
export type AgencyOverview = {
  id: string
  name: string
  city: string | null
  created_at: string
  is_active: boolean
  plan: string
  subscription_status: string
  next_payment_date: string | null
  monthly_fee: number
  members: number
  vehicles: number
  reservations: number
  revMonth: number
  overdue: boolean
}

// ── Overview of all agencies ───────────────────────────
export const listAgencies = createServerFn({ method: 'GET' }).handler(async (): Promise<AgencyOverview[]> => {
  const { admin } = await requirePlatformAdmin()
  const today = agencyToday()

  // Counting is done in Postgres (see migration 0011) — no more pulling every
  // member/vehicle/reservation row across all agencies into the server.
  const { data, error } = await admin.rpc('platform_agency_overview')
  if (error) throw new Error(error.message)

  return (data ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    city: a.city ?? null,
    created_at: a.created_at,
    is_active: a.is_active ?? true,
    plan: a.plan ?? 'trial',
    subscription_status: a.subscription_status ?? 'trial',
    next_payment_date: a.next_payment_date ?? null,
    monthly_fee: Number(a.monthly_fee ?? 0),
    members: Number(a.members ?? 0),
    vehicles: Number(a.vehicles ?? 0),
    reservations: Number(a.reservations ?? 0),
    revMonth: Number(a.rev_month ?? 0),
    overdue: !!a.next_payment_date && a.next_payment_date < today && a.subscription_status !== 'active',
  }))
})

// ── One agency, full detail ────────────────────────────
export type AgencyMemberRow = { id: string; user_id: string; role: string; full_name: string | null; phone: string | null; email: string | null }
export type PaymentRow = { id: string; amount: number; period: string | null; method: string | null; notes: string | null; paid_at: string }

export const getAgency = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    const [{ data: agency }, { data: members }, { data: vehicles }, { data: reservations }, { data: payments }] =
      await Promise.all([
        admin.from('agencies').select('*').eq('id', data.id).maybeSingle(),
        admin.from('agency_members').select('id, user_id, role, full_name, phone').eq('agency_id', data.id),
        admin.from('vehicles').select('id, plate, brand, status, daily_rate').eq('agency_id', data.id).order('plate'),
        admin
          .from('reservations')
          .select('id, date_start, date_end, status, total_amount, vehicles(plate), clients(full_name)')
          .eq('agency_id', data.id)
          .order('date_start', { ascending: false })
          .limit(25),
        admin.from('agency_payments').select('*').eq('agency_id', data.id).order('paid_at', { ascending: false }),
      ])
    if (!agency) throw new Error('Agency not found')

    // Resolve member emails from auth.
    const memberRows: AgencyMemberRow[] = []
    for (const m of (members ?? []) as any[]) {
      let email: string | null = null
      try {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id)
        email = u?.user?.email ?? null
      } catch {
        /* ignore */
      }
      memberRows.push({ id: m.id, user_id: m.user_id, role: m.role, full_name: m.full_name, phone: m.phone, email })
    }

    return {
      agency: agency as any,
      members: memberRows,
      vehicles: (vehicles ?? []) as any[],
      reservations: (reservations ?? []).map((r: any) => ({
        id: r.id,
        date_start: r.date_start,
        date_end: r.date_end,
        status: r.status,
        total_amount: r.total_amount ?? null,
        vehicle_plate: r.vehicles?.plate ?? null,
        client_name: r.clients?.full_name ?? null,
      })),
      payments: (payments ?? []) as PaymentRow[],
    }
  })

// ── Mutations ──────────────────────────────────────────
export const setAgencyActive = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    const { error } = await admin.from('agencies').update({ is_active: data.active }).eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const updateAgencySubscription = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        plan: z.string().min(1),
        subscription_status: z.enum(['trial', 'active', 'past_due', 'suspended']),
        subscription_started: z.string().optional(),
        next_payment_date: z.string().optional(),
        monthly_fee: z.coerce.number().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    const { error } = await admin
      .from('agencies')
      .update({
        plan: data.plan,
        subscription_status: data.subscription_status,
        subscription_started: data.subscription_started || null,
        next_payment_date: data.next_payment_date || null,
        monthly_fee: data.monthly_fee,
      })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const recordPayment = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        agency_id: z.string().uuid(),
        amount: z.coerce.number().min(0),
        period: z.string().optional(),
        method: z.string().optional(),
        notes: z.string().optional(),
        paid_at: z.string().optional(),
        next_payment_date: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    const { error } = await admin.from('agency_payments').insert({
      agency_id: data.agency_id,
      amount: data.amount,
      period: data.period ?? null,
      method: data.method ?? null,
      notes: data.notes ?? null,
      paid_at: data.paid_at || agencyToday(),
    })
    if (error) throw new Error(error.message)
    // Recording a payment marks the sub active and can advance the next due date.
    await admin
      .from('agencies')
      .update({
        subscription_status: 'active',
        ...(data.next_payment_date ? { next_payment_date: data.next_payment_date } : {}),
      })
      .eq('id', data.agency_id)
    return { ok: true }
  })

export const inviteAgencyUser = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        agency_id: z.string().uuid(),
        email: z.string().email(),
        full_name: z.string().optional(),
        role: z.enum(['owner', 'staff']).default('staff'),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    // Invite (or reuse) the auth user, then attach a membership.
    let userId: string | null = null
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(data.email)
    if (invited?.user) userId = invited.user.id
    else if (invErr) {
      // Likely already exists — page through all users to find them.
      const found = await findUserByEmail(admin, data.email)
      if (!found) throw new Error(invErr.message)
      userId = found.id
    }
    if (!userId) throw new Error('Could not resolve user')

    const { error } = await admin.from('agency_members').insert({
      agency_id: data.agency_id,
      user_id: userId,
      role: data.role,
      full_name: data.full_name ?? null,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const removeAgencyMember = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ member_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await requirePlatformAdmin()
    const { error } = await admin.from('agency_members').delete().eq('id', data.member_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
