import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import {
  getSupabaseServerClient,
  getSupabaseAdminClient,
} from '~/lib/supabase.server'
import { onboardingSchema, slugify } from '~/lib/schemas'
import { ACTIVE_AGENCY_COOKIE } from './context'

// Complete a magic-link / OTP sign-in ON THE SERVER. The PKCE code verifier is
// stored in a cookie by @supabase/ssr; only the server client (wired to the
// request cookies) can read it, so the exchange must happen here — doing it in
// the browser throws "PKCE code verifier not found in storage".
export const exchangeAuthCode = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().optional(),
        token_hash: z.string().optional(),
        type: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    if (data.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(data.code)
      if (error) throw new Error(error.message)
    } else if (data.token_hash && data.type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type as EmailOtpType,
      })
      if (error) throw new Error(error.message)
    } else {
      throw new Error('Invalid confirmation link')
    }
    return { ok: true }
  })

export type Membership = {
  agency_id: string
  role: string
  full_name: string | null
  agency: {
    name: string
    slug: string
    language: string
    logo_url: string | null
    is_active: boolean
    subscription_status: string
  } | null
}

export type AuthState = {
  user: { id: string; email: string | null } | null
  memberships: Membership[]
  activeAgencyId: string | null
  isPlatformAdmin: boolean
}

// Current user + their agency memberships. Called from route beforeLoad on both
// server and client (RLS keeps it scoped to the logged-in user).
export const getAuthState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthState> => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { user: null, memberships: [], activeAgencyId: null, isPlatformAdmin: false }

    const { data } = await supabase
      .from('agency_members')
      .select('agency_id, role, full_name, agencies(name, slug, language, logo_url, is_active, subscription_status)')
      .eq('user_id', user.id)

    const memberships: Membership[] = (data ?? []).map((m: any) => ({
      agency_id: m.agency_id,
      role: m.role,
      full_name: m.full_name,
      agency: m.agencies
        ? {
            name: m.agencies.name,
            slug: m.agencies.slug,
            language: m.agencies.language,
            logo_url: m.agencies.logo_url ?? null,
            is_active: m.agencies.is_active ?? true,
            subscription_status: m.agencies.subscription_status ?? 'trial',
          }
        : null,
    }))

    // Platform-admin check (service role bypasses RLS on platform_admins).
    let isPlatformAdmin = false
    try {
      const admin = getSupabaseAdminClient() as any
      const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      isPlatformAdmin = !!pa
    } catch {
      /* table may not exist yet before migration — treat as not admin */
    }

    // Which agency the user is currently working in (validated against their
    // memberships; falls back to the first). Drives the multi-agency switcher.
    const wanted = getCookies()?.[ACTIVE_AGENCY_COOKIE]
    const activeAgencyId =
      memberships.find((m) => m.agency_id === wanted)?.agency_id ?? memberships[0]?.agency_id ?? null

    return { user: { id: user.id, email: user.email ?? null }, memberships, activeAgencyId, isPlatformAdmin }
  },
)

// Switch the active agency for a multi-agency user. Validates membership, then
// persists the choice in a cookie that requireAgencyContext / getAuthState read.
export const setActiveAgency = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ agency_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: member } = await supabase
      .from('agency_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('agency_id', data.agency_id)
      .maybeSingle()
    if (!member) throw new Error('Not a member of that agency')

    setCookie(ACTIVE_AGENCY_COOKIE, data.agency_id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
    return { ok: true }
  })

// Create a new agency and make the current user its owner.
// Uses the service-role client to bootstrap atomically (no INSERT policy needed).
export const createAgency = createServerFn({ method: 'POST' })
  .validator((input: unknown) => onboardingSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const admin = getSupabaseAdminClient()
    const slug = `${slugify(data.agencyName) || 'agency'}-${Math.random()
      .toString(36)
      .slice(2, 7)}`

    const { data: agency, error } = await admin
      .from('agencies')
      .insert({
        name: data.agencyName,
        slug,
        city: data.city ?? null,
        language: data.language,
      })
      .select('id, slug')
      .single()
    if (error || !agency) throw new Error(error?.message ?? 'Failed to create agency')

    const { error: memErr } = await admin.from('agency_members').insert({
      agency_id: (agency as any).id,
      user_id: user.id,
      role: 'owner',
      full_name: data.ownerName,
      phone: data.phone ?? null,
    })
    if (memErr) throw new Error(memErr.message)

    return { slug: (agency as any).slug as string }
  })

// Sign out — clears the auth cookies via the server client.
export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  await supabase.auth.signOut()
  return { ok: true }
})
