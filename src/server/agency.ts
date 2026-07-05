import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { presignUpload, publicUrl, deleteObject } from '~/lib/r2.server'

export type AgencyProfile = {
  id: string
  name: string
  slug: string
  city: string | null
  logo_url: string | null
  role: string
  canEdit: boolean
}

// Current agency profile for the settings screen.
export const getAgencyProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AgencyProfile> => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('agencies')
      .select('id, name, slug, city, logo_url')
      .eq('id', agencyId)
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Agency not found')
    return {
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      city: (data as any).city ?? null,
      logo_url: (data as any).logo_url ?? null,
      role,
      canEdit: role === 'owner',
    }
  },
)

// Presigned PUT so the browser uploads the logo straight to R2.
export const presignAgencyLogo = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ name: z.string(), type: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the logo')
    if (!data.type.startsWith('image/')) throw new Error('Logo must be an image')
    const safe = data.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40)
    const key = `agencies/${agencyId}/logo-${crypto.randomUUID()}-${safe}`
    return { key, url: await presignUpload(key, data.type), publicUrl: publicUrl(key) }
  })

// Persist the new logo URL (or clear it). RLS also restricts this to owners.
export const updateAgencyLogo = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ logo_url: z.string().url().nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, agencyId, role } = await requireAgencyContext()
    if (role !== 'owner') throw new Error('Only the owner can change the logo')

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
