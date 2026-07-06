import { getCookies } from '@tanstack/react-start/server'
import { getSupabaseServerClient } from '~/lib/supabase.server'

export const ACTIVE_AGENCY_COOKIE = 'active_agency'

export type AgencyContext = {
  supabase: ReturnType<typeof getSupabaseServerClient>
  userId: string
  agencyId: string
  memberId: string
  role: string
}

// Resolves the caller's active agency. Use inside server functions.
// A user may belong to several agencies (e.g. a multi-branch owner); the one
// they're currently working in is stored in the `active_agency` cookie. We
// validate that the cookie names an agency they actually belong to, otherwise
// fall back to their first membership. RLS still enforces isolation; agencyId
// here is for INSERTs / scoping.
export async function requireAgencyContext(): Promise<AgencyContext> {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: members, error } = await supabase
    .from('agency_members')
    .select('id, agency_id, role')
    .eq('user_id', user.id)
  if (error || !members || members.length === 0) throw new Error('No agency membership')

  const wanted = getCookies()?.[ACTIVE_AGENCY_COOKIE]
  const member = (members as any[]).find((m) => m.agency_id === wanted) ?? (members as any[])[0]

  return {
    supabase,
    userId: user.id,
    agencyId: member.agency_id,
    memberId: member.id,
    role: member.role,
  }
}
