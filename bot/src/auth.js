import { supabase } from './supabase.js'
import { normalizePhone } from './config.js'

// Build the common stored representations of a number so an indexed `.in()`
// lookup hits regardless of how it was saved (normalized 212…, local 0…, +212…).
function phoneCandidates(target) {
  const c = new Set([target])
  if (target.startsWith('212')) c.add(`0${target.slice(3)}`)
  c.add(`+${target}`)
  c.add(`00${target}`)
  return [...c]
}

// Resolve an incoming phone to an agency IF AND ONLY IF that number is saved in
// the DB (an agency's WhatsApp number, or an owner's phone). Returns null for
// every other number — the caller must then STAY SILENT.
//
// Indexed lookups only (idx_agencies_whatsapp_number, idx_agency_members_phone)
// — no full-table scan, so this scales to many agencies.
export async function getAuthorizedAgency(rawPhone) {
  const target = normalizePhone(rawPhone)
  if (!target) return null

  // 1) Agency's dedicated WhatsApp number (stored normalized by the app).
  const { data: agency } = await supabase
    .from('agencies')
    .select('id, name')
    .eq('whatsapp_number', target)
    .limit(1)
    .maybeSingle()
  if (agency) return { id: agency.id, name: agency.name }

  // 2) An owner's personal phone (stored in any common form).
  const { data: member } = await supabase
    .from('agency_members')
    .select('agency_id, agencies(name)')
    .eq('role', 'owner')
    .in('phone', phoneCandidates(target))
    .limit(1)
    .maybeSingle()
  if (member) return { id: member.agency_id, name: member.agencies?.name ?? 'Agence' }

  return null // unknown number → not authorized
}
