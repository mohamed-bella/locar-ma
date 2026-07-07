import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { advanceVehicleMileage } from './mileage'
import { presignUpload, publicUrl } from '~/lib/r2.server'
import { agencyToday } from '~/lib/tz'
import { MAX_IMAGE_BYTES } from '~/lib/schemas'

// ── Vehicle issues (problems / accidents / garage / admin / cleaning holds) ──
// The operational-status engine (src/lib/intelligence.ts) reads these to decide
// whether a car can be rented today. Writes here therefore change the verdict.

export type VehicleIssue = {
  id: string
  vehicle_id: string
  kind: string
  category: string | null
  severity: 'low' | 'medium' | 'critical'
  status: 'open' | 'in_progress' | 'resolved'
  blocks_rental: boolean
  title: string
  description: string | null
  photo_keys: string[]
  photo_urls: string[]
  cost: number | null
  garage: string | null
  opened_at: string
  resolved_at: string | null
  created_at: string
}

const ISSUE_KINDS = ['problem', 'accident', 'admin', 'cleaning', 'garage'] as const
const ISSUE_SEVERITIES = ['low', 'medium', 'critical'] as const
const ISSUE_STATUSES = ['open', 'in_progress', 'resolved'] as const

function mapIssue(row: any): VehicleIssue {
  const keys: string[] = row.photo_keys ?? []
  return { ...row, photo_keys: keys, photo_urls: keys.map((k: string) => publicUrl(k)) }
}

// A lighter shape for the fleet grid — just what the engine needs per vehicle.
export type OpenIssueLite = {
  id: string
  vehicle_id: string
  kind: string
  severity: 'low' | 'medium' | 'critical'
  status: string
  blocks_rental: boolean
  title: string
}

// All still-open issues across the agency (for the /suivi grid decision).
export const listOpenIssues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OpenIssueLite[]> => {
    const { supabase } = await requireAgencyContext()
    const { data, error } = await supabase
      .from('vehicle_issues')
      .select('id, vehicle_id, kind, severity, status, blocks_rental, title')
      .neq('status', 'resolved')
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as OpenIssueLite[]
  },
)

// Full history for one vehicle (open + resolved), newest first.
export const listVehicleIssues = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<VehicleIssue[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('vehicle_issues')
      .select('*')
      .eq('vehicle_id', data.vehicle_id)
      .order('opened_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((rows ?? []) as any[]).map(mapIssue)
  })

const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' || v == null ? undefined : v), s.optional())

const createIssueSchema = z.object({
  vehicle_id: z.string().uuid(),
  kind: z.enum(ISSUE_KINDS).default('problem'),
  category: opt(z.string()),
  severity: z.enum(ISSUE_SEVERITIES).default('medium'),
  blocks_rental: z.coerce.boolean().default(false),
  title: z.string().min(1),
  description: opt(z.string()),
  photo_keys: z.array(z.string()).default([]),
  cost: opt(z.coerce.number().min(0)),
  garage: opt(z.string()),
  opened_at: opt(z.string()),
})

export const createIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => createIssueSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()
    // A car sent to the garage / in accident should immediately show off-road;
    // the derived engine handles the verdict, but flip the manual hold too so the
    // rest of the app (bookings, fleet grid) agrees.
    const { error } = await supabase.from('vehicle_issues').insert({
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      kind: data.kind,
      category: data.category ?? null,
      severity: data.severity,
      status: data.kind === 'garage' ? 'in_progress' : 'open',
      blocks_rental: data.blocks_rental,
      title: data.title,
      description: data.description ?? null,
      photo_keys: data.photo_keys,
      cost: data.cost ?? null,
      garage: data.garage ?? null,
      opened_at: data.opened_at ?? agencyToday(),
      created_by: memberId,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

const updateIssueSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ISSUE_STATUSES).optional(),
  severity: z.enum(ISSUE_SEVERITIES).optional(),
  blocks_rental: z.coerce.boolean().optional(),
  cost: opt(z.coerce.number().min(0)),
  garage: opt(z.string()),
  notes: opt(z.string()),
})

// Advance an issue through its lifecycle: mark in-progress (car at garage),
// resolve it (back on the road), tweak severity, or attach the repair cost.
export const updateIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => updateIssueSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const patch: Record<string, unknown> = {}
    if (data.status) {
      patch.status = data.status
      patch.resolved_at = data.status === 'resolved' ? agencyToday() : null
    }
    if (data.severity) patch.severity = data.severity
    if (data.blocks_rental != null) patch.blocks_rental = data.blocks_rental
    if (data.cost != null) patch.cost = data.cost
    if (data.garage != null) patch.garage = data.garage
    if (data.notes != null) patch.description = data.notes
    if (Object.keys(patch).length === 0) return { ok: true }
    const { error } = await supabase.from('vehicle_issues').update(patch).eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const deleteIssue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const { error } = await supabase.from('vehicle_issues').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// Presign direct-to-R2 PUT URLs for issue photos (mirrors presignDamageUploads).
const imageFileSchema = z.object({
  name: z.string(),
  type: z.string().startsWith('image/', 'Only image files are allowed'),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Image is too large (max 8 MB)'),
})

export const presignIssueUploads = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ vehicle_id: z.string().uuid(), files: z.array(imageFileSchema).min(1).max(12) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId } = await requireAgencyContext()
    const out: { key: string; url: string }[] = []
    for (const f of data.files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      const key = `agencies/${agencyId}/vehicles/${data.vehicle_id}/issues/${crypto.randomUUID()}-${safe}`
      out.push({ key, url: await presignUpload(key, f.type, 300, f.size) })
    }
    return out
  })

// ── Check rapide (quick check) ──────────────────────────────────────────────
// The 30-second before/after-rental check. The staff records what they see; the
// system does the thinking: advance the odometer, and open an issue when a fault
// is reported (which then feeds the operational-status engine automatically).
const quickCheckSchema = z.object({
  vehicle_id: z.string().uuid(),
  mileage: opt(z.coerce.number().int().min(0)),
  fuel: opt(z.enum(['empty', 'quarter', 'half', 'three_quarters', 'full'])),
  clean: z.coerce.boolean().default(true),
  warning_light: z.coerce.boolean().default(false),
  tyres_ok: z.coerce.boolean().default(true),
  new_damage: z.coerce.boolean().default(false),
  client_reported: z.coerce.boolean().default(false),
  note: opt(z.string()),
  photo_keys: z.array(z.string()).default([]),
})

export const quickCheck = createServerFn({ method: 'POST' })
  .validator((d: unknown) => quickCheckSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; issuesOpened: number }> => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()
    const today = agencyToday()

    // 1) Odometer: single writer (forward-only). See server/mileage.ts.
    await advanceVehicleMileage(supabase, data.vehicle_id, data.mileage ?? null)

    // 2) Turn reported faults into issues (the engine decides the verdict).
    const issues: any[] = []
    const base = {
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      status: 'open',
      opened_at: today,
      created_by: memberId,
      description: data.note ?? null,
      photo_keys: data.photo_keys,
    }
    if (data.warning_light) {
      issues.push({ ...base, kind: 'problem', category: 'mechanical', severity: 'critical', blocks_rental: true, title: 'Voyant moteur' })
    }
    if (!data.tyres_ok) {
      issues.push({ ...base, kind: 'problem', category: 'tyres', severity: 'medium', blocks_rental: false, title: 'Pneus à vérifier' })
    }
    if (data.new_damage) {
      issues.push({ ...base, kind: 'problem', category: 'body', severity: 'low', blocks_rental: false, title: 'Nouveau dommage' })
      // Mirror the damage into the existing photo-first damage log for the record.
      await supabase.from('damage_reports').insert({
        agency_id: agencyId,
        vehicle_id: data.vehicle_id,
        type: 'return',
        photo_keys: data.photo_keys,
        notes: data.note ?? 'Check rapide',
        recorded_by: memberId,
      })
    }
    if (!data.clean) {
      issues.push({ ...base, kind: 'cleaning', category: null, severity: 'low', blocks_rental: false, title: 'Nettoyage nécessaire', photo_keys: [] })
    }
    if (data.client_reported) {
      issues.push({ ...base, kind: 'problem', category: 'other', severity: 'medium', blocks_rental: false, title: 'Signalé par le client' })
    }

    if (issues.length > 0) {
      const { error } = await supabase.from('vehicle_issues').insert(issues)
      if (error) throw new Error(error.message)
    }
    return { ok: true, issuesOpened: issues.length }
  })

export { ISSUE_KINDS, ISSUE_SEVERITIES, ISSUE_STATUSES }
