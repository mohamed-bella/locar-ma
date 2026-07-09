import 'dotenv/config'
import { supabase } from './supabase.js'

export const SUPABASE_URL = process.env.SUPABASE_URL
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

// Daily report — hour (0–23, Casablanca time) to send it. Empty/unset disables.
export const REPORT_HOUR =
  process.env.REPORT_HOUR != null && process.env.REPORT_HOUR !== ''
    ? Number(process.env.REPORT_HOUR)
    : null

// Normalize Moroccan phone → international digits (no + prefix).
export function normalizePhone(phone) {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `212${digits.slice(1)}`
  return digits || null
}

// Resolve the agency's WhatsApp target at send time (no cache) so a number
// changed in Settings takes effect on the very next notification. It's a single
// indexed row lookup — cheap enough to run per message.
export async function getOwnerJid(agencyId) {
  // Prefer the agency's dedicated WhatsApp notification number (set in Settings).
  // Fall back to the owner member's personal phone.
  const [{ data: agency }, { data: member }] = await Promise.all([
    supabase.from('agencies').select('whatsapp_number').eq('id', agencyId).maybeSingle(),
    supabase
      .from('agency_members')
      .select('phone')
      .eq('agency_id', agencyId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle(),
  ])

  const phone = normalizePhone(agency?.whatsapp_number) ?? normalizePhone(member?.phone)
  const jid = phone ? `${phone}@s.whatsapp.net` : null

  if (!jid) {
    console.warn(`No WhatsApp number for agency ${agencyId} (set one in Settings → Account)`)
  }

  return jid
}
