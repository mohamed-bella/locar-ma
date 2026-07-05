import { getSupabaseServerClient } from '~/lib/supabase.server'

export type AgencyContext = {
  supabase: ReturnType<typeof getSupabaseServerClient>
  userId: string
  agencyId: string
  memberId: string
  role: string
}

// Resolves the caller's active agency. Use inside server functions.
// RLS still enforces isolation; agencyId here is for INSERTs / scoping.
export async function requireAgencyContext(): Promise<AgencyContext> {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member, error } = await supabase
    .from('agency_members')
    .select('id, agency_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (error || !member) throw new Error('No agency membership')

  return {
    supabase,
    userId: user.id,
    agencyId: (member as any).agency_id,
    memberId: (member as any).id,
    role: (member as any).role,
  }
}
