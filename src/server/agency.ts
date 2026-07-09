import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { presignUpload, publicUrl, deleteObject } from '~/lib/r2.server'
import { MAX_LOGO_BYTES } from '~/lib/schemas'

export type AgencyProfile = {
  id: string
  name: string
  slug: string
  city: string | null
  logo_url: string | null
  stamp_url: string | null
  whatsapp_number: string | null
  whatsapp_enabled: boolean
  // Company legal info printed on the contract.
  legal_name: string | null
  address: string | null
  ice: string | null
  rc: string | null
  patente: string | null
  rib: string | null
  company_phone: string | null
  role: string
  canEdit: boolean
}

// Current agency profile for the settings screen.
export const getAgencyProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AgencyProfile> => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('agencies')
      .select(
        'id, name, slug, city, logo_url, stamp_url, whatsapp_number, whatsapp_enabled, legal_name, address, ice, rc, patente, rib, company_phone',
      )
      .eq('id', agencyId)
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Agency not found')
    const a = data as any
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      city: a.city ?? null,
      logo_url: a.logo_url ?? null,
      stamp_url: a.stamp_url ?? null,
      whatsapp_number: a.whatsapp_number ?? null,
      whatsapp_enabled: a.whatsapp_enabled ?? true,
      legal_name: a.legal_name ?? null,
      address: a.address ?? null,
      ice: a.ice ?? null,
      rc: a.rc ?? null,
      patente: a.patente ?? null,
      rib: a.rib ?? null,
      company_phone: a.company_phone ?? null,
      role,
      canEdit: role === 'owner',
    }
  },
)

// Normalize a Moroccan/international number to bare digits (no +, no spaces).
// Empty string → null (clears the field).
function normalizeWhatsApp(raw: string | null | undefined): string | null {
  let digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `212${digits.slice(1)}`
  return digits
}

// Update the agency's display name and/or WhatsApp notification number.
// Owner-only (RLS also enforces it).
export const updateAgencyProfile = createServerFn({ method: 'POST' })
  .validator((d: unknown) => {
    const optText = z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().max(200).nullable().optional(),
    )
    return z
      .object({
        name: z.string().trim().min(1, 'Name is required').max(120),
        whatsapp_number: z.string().trim().max(30).nullable().optional(),
        whatsapp_enabled: z.boolean().optional(),
        legal_name: optText,
        address: optText,
        ice: optText,
        rc: optText,
        patente: optText,
        rib: optText,
        company_phone: optText,
      })
      .parse(d)
  })
  .handler(async ({ data }) => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change account settings')

    // Partial update — only touch fields actually sent (undefined = skip), so a
    // toggle-only call doesn't wipe the legal fields. An empty string arrives as
    // null (clear), which is distinct from undefined.
    const upd: Record<string, unknown> = { name: data.name }
    if (data.whatsapp_number !== undefined) upd.whatsapp_number = normalizeWhatsApp(data.whatsapp_number)
    if (data.whatsapp_enabled !== undefined) upd.whatsapp_enabled = data.whatsapp_enabled
    for (const k of ['legal_name', 'address', 'ice', 'rc', 'patente', 'rib', 'company_phone'] as const) {
      if (data[k] !== undefined) upd[k] = data[k]
    }

    const { error } = await supabase.from('agencies').update(upd).eq('id', agencyId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// Presigned PUT so the browser uploads the logo straight to R2.
export const presignAgencyLogo = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        name: z.string(),
        type: z.string().startsWith('image/', 'Logo must be an image'),
        size: z.number().int().positive().max(MAX_LOGO_BYTES, 'Logo is too large (max 2 MB)'),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the logo')
    const safe = data.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40)
    const key = `agencies/${agencyId}/logo-${crypto.randomUUID()}-${safe}`
    return { key, url: await presignUpload(key, data.type, 300, data.size), publicUrl: publicUrl(key) }
  })

// Persist the new logo URL (or clear it). RLS also restricts this to owners.
export const updateAgencyLogo = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ logo_url: z.string().url().nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the logo')

    // Only accept URLs that live in our own R2 public bucket — never let an
    // arbitrary external host be stored and rendered as the brand mark.
    if (data.logo_url && !data.logo_url.startsWith(publicUrl(''))) {
      throw new Error('Invalid logo URL')
    }

    // Best-effort cleanup of the previous R2 object.
    const { data: prev } = await supabase
      .from('agencies')
      .select('logo_url')
      .eq('id', agencyId)
      .single()
    const oldUrl = (prev as any)?.logo_url as string | null
    if (oldUrl && oldUrl !== data.logo_url) {
      const base = publicUrl('')
      if (oldUrl.startsWith(base)) {
        try {
          await deleteObject(oldUrl.slice(base.length))
        } catch {
          /* ignore — orphan object is harmless */
        }
      }
    }

    const { error } = await supabase
      .from('agencies')
      .update({ logo_url: data.logo_url })
      .eq('id', agencyId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// Presigned PUT for the agency stamp / cachet (same flow as the logo).
export const presignAgencyStamp = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        name: z.string(),
        type: z.string().startsWith('image/', 'Stamp must be an image'),
        size: z.number().int().positive().max(MAX_LOGO_BYTES, 'Stamp is too large (max 2 MB)'),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the stamp')
    const safe = data.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40)
    const key = `agencies/${agencyId}/stamp-${crypto.randomUUID()}-${safe}`
    return { key, url: await presignUpload(key, data.type, 300, data.size), publicUrl: publicUrl(key) }
  })

// Persist the new stamp URL (or clear it). Owner-only (RLS enforced too).
export const updateAgencyStamp = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ stamp_url: z.string().url().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the stamp')

    if (data.stamp_url && !data.stamp_url.startsWith(publicUrl(''))) {
      throw new Error('Invalid stamp URL')
    }

    const { data: prev } = await supabase
      .from('agencies')
      .select('stamp_url')
      .eq('id', agencyId)
      .single()
    const oldUrl = (prev as any)?.stamp_url as string | null
    if (oldUrl && oldUrl !== data.stamp_url) {
      const base = publicUrl('')
      if (oldUrl.startsWith(base)) {
        try {
          await deleteObject(oldUrl.slice(base.length))
        } catch {
          /* ignore — orphan object is harmless */
        }
      }
    }

    const { error } = await supabase
      .from('agencies')
      .update({ stamp_url: data.stamp_url })
      .eq('id', agencyId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
