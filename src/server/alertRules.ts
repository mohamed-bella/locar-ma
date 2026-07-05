import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'

export type AlertRule = {
  id: string
  agency_id: string
  field: string
  label: string
  threshold_days: number
  created_at: string
}

export const listAlertRules = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AlertRule[]> => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('document_alert_rules')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)

    // Seeding default alerts if none have been configured yet
    if (!data || data.length === 0) {
      const defaults = [
        { agency_id: agencyId, field: 'insurance_expiry', label: 'Insurance Warning', threshold_days: 30 },
        { agency_id: agencyId, field: 'vignette_expiry', label: 'Vignette Warning', threshold_days: 30 },
        { agency_id: agencyId, field: 'visite_tech_expiry', label: 'Visite technique Warning', threshold_days: 30 },
      ]
      const { data: inserted, error: insertError } = await supabase
        .from('document_alert_rules')
        .insert(defaults)
        .select('*')
      if (insertError) throw new Error(insertError.message)
      return (inserted as unknown as AlertRule[]) ?? []
    }

    return data as unknown as AlertRule[]
  },
)

export const createAlertRule = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      field: z.string().min(1),
      label: z.string().min(1),
      threshold_days: z.number().int().positive(),
    }),
  )
  .handler(async ({ data: input }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('document_alert_rules')
      .insert({
        agency_id: agencyId,
        field: input.field,
        label: input.label,
        threshold_days: input.threshold_days,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as unknown as AlertRule
  })

export const updateAlertRule = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      field: z.string().min(1),
      label: z.string().min(1),
      threshold_days: z.number().int().positive(),
    }),
  )
  .handler(async ({ data: input }) => {
    const { supabase } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('document_alert_rules')
      .update({
        field: input.field,
        label: input.label,
        threshold_days: input.threshold_days,
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as unknown as AlertRule
  })

export const deleteAlertRule = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ data: input }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase
      .from('document_alert_rules')
      .delete()
      .eq('id', input.id)
    if (error) throw new Error(error.message)
    return { success: true }
  })
