import { getSupabaseAdminClient } from './supabase.server'

export type MobileContext = {
  admin: ReturnType<typeof getSupabaseAdminClient>
  userId: string
  agencyId: string
  memberId: string
  role: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export { json }

export async function requireMobileAuth(request: Request): Promise<MobileContext | Response> {
  const authz = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authz?.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : null
  if (!token) return json({ error: 'Missing bearer token' }, 401)

  const admin = getSupabaseAdminClient() as any

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return json({ error: 'Invalid token' }, 401)

  const { data: members, error: memErr } = await admin
    .from('agency_members')
    .select('id, agency_id, role')
    .eq('user_id', user.id)
  if (memErr || !members || members.length === 0) return json({ error: 'No agency membership' }, 403)

  const member = (members as any[])[0]

  return {
    admin,
    userId: user.id,
    agencyId: member.agency_id,
    memberId: member.id,
    role: member.role,
  }
}

export async function parseJsonBody(request: Request): Promise<any> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
