import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { slugify } from '~/lib/schemas'

export type DocumentType = {
  id: string
  agency_id: string
  name: string
  code: string
  created_at: string
}

export const listDocumentTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DocumentType[]> => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return (data as unknown as DocumentType[]) ?? []
  },
)

export const createDocumentType = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().min(1, 'Name is required'),
    }),
  )
  .handler(async ({ data: input }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const code = 'custom_' + slugify(input.name).replace(/-/g, '_')
    const { data, error } = await supabase
      .from('document_types')
      .insert({
        agency_id: agencyId,
        name: input.name.trim(),
        code,
      })
      .select('*')
      .single()
    if (error) {
      if ((error as any).code === '23505') {
        throw new Error('A document type with this name already exists')
      }
      throw new Error(error.message)
    }
    return data as unknown as DocumentType
  })

export const deleteDocumentType = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ data: input }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase
      .from('document_types')
      .delete()
      .eq('id', input.id)
    if (error) throw new Error(error.message)
    return { success: true }
  })
