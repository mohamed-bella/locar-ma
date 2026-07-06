import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { brandSchema, MAX_LOGO_BYTES } from '~/lib/schemas'
import { presignUpload, publicUrl } from '~/lib/r2.server'

export type Brand = {
  id: string
  name: string
  logo_key: string | null
  logo_url: string | null
  created_by: string | null
  hidden: boolean
  mine: boolean
}

function mapBrand(row: any, hiddenIds: Set<string>, userId: string): Brand {
  return {
    id: row.id,
    name: row.name,
    logo_key: row.logo_key ?? null,
    logo_url: row.logo_key ? publicUrl(row.logo_key) : null,
    created_by: row.created_by ?? null,
    hidden: hiddenIds.has(row.id),
    mine: row.created_by === userId,
  }
}

async function fetchBrands(includeHidden: boolean) {
  const { supabase, agencyId, userId } = await requireAgencyContext()
  const [{ data: brands, error }, { data: hidden }] = await Promise.all([
    supabase.from('brands').select('*').order('name'),
    supabase.from('agency_hidden_brands').select('brand_id').eq('agency_id', agencyId),
  ])
  if (error) throw new Error(error.message)
  const hiddenIds = new Set((hidden ?? []).map((h: any) => h.brand_id))
  const all = (brands ?? []).map((b) => mapBrand(b, hiddenIds, userId))
  return includeHidden ? all : all.filter((b) => !b.hidden)
}

// Visible brands for pickers (hidden ones excluded).
export const listBrands = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Brand[]> => fetchBrands(false),
)

// Full catalog incl. hidden — for the settings screen.
export const listAllBrands = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Brand[]> => fetchBrands(true),
)

export const presignBrandLogo = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        name: z.string(),
        type: z.string().startsWith('image/', 'Only image files are allowed'),
        size: z.number().int().positive().max(MAX_LOGO_BYTES, 'Logo is too large (max 2 MB)'),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAgencyContext()
    const safe = data.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-50)
    const key = `brands/${crypto.randomUUID()}-${safe}`
    return { key, url: await presignUpload(key, data.type, 300, data.size) }
  })

export const createBrand = createServerFn({ method: 'POST' })
  .validator((d: unknown) => brandSchema.parse(d))
  .handler(async ({ data }): Promise<Brand> => {
    const { supabase, userId } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('brands')
      .insert({ name: data.name.trim(), logo_key: data.logo_key ?? null, created_by: userId })
      .select('*')
      .single()
    if (error) {
      if ((error as any).code === '23505') throw new Error('That brand already exists')
      throw new Error(error.message)
    }
    return mapBrand(row, new Set(), userId)
  })

// Hide a brand for THIS agency only (others keep it).
export const hideBrand = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { error } = await supabase
      .from('agency_hidden_brands')
      .upsert({ agency_id: agencyId, brand_id: data.brand_id })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const unhideBrand = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { error } = await supabase
      .from('agency_hidden_brands')
      .delete()
      .eq('agency_id', agencyId)
      .eq('brand_id', data.brand_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
