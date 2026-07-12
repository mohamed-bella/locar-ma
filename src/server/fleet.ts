import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAgencyContext } from './context'
import { vehicleSchema, damageReportSchema, MAX_IMAGE_BYTES } from '~/lib/schemas'
import { presignUpload, publicUrl, deleteObject, putObject } from '~/lib/r2.server'
import { agencyToday } from '~/lib/tz'
import { deriveVehicleStatus } from './vehicleStatus'
import { notifyVehicle, scheduleNotify } from '~/lib/email.server'
import { enqueueVehicleNotification } from './notifications'

// Best-effort R2 cleanup — an orphaned object is harmless, a thrown error that
// blocks a delete is not. Never let storage cleanup fail the DB operation.
async function bestEffortDelete(keys: (string | null | undefined)[], bucket?: string) {
  await Promise.all(
    keys
      .filter((k): k is string => !!k)
      .map((k) => deleteObject(k, bucket).catch(() => {})),
  )
}

export type Vehicle = {
  id: string
  plate: string
  brand: string | null
  brand_id: string | null
  brand_logo_url: string | null
  model: string | null
  year: number | null
  category: string | null
  daily_rate: number
  status: string
  mileage_current: number
  insurance_expiry: string | null
  vignette_expiry: string | null
  visite_tech_expiry: string | null
  oil_change_last_km: number | null
  oil_change_interval_km: number
  oil_change_last_date: string | null
  next_service_note: string | null
  notes: string | null
  image_keys: string[]
  image_urls: string[]
  created_at: string
  document_expiries?: Record<string, string | null>
}

const VEHICLE_SELECT = '*, brands(name, logo_key)'

function mapVehicle(row: any): Vehicle {
  const keys: string[] = row.image_keys ?? []
  const brandRow = row.brands ?? null
  const { brands, ...rest } = row
  return {
    ...rest,
    brand: rest.brand ?? brandRow?.name ?? null,
    image_keys: keys,
    image_urls: keys.map((k) => publicUrl(k)),
    brand_logo_url: brandRow?.logo_key ? publicUrl(brandRow.logo_key) : null,
    oil_change_last_km: rest.oil_change_last_km ?? null,
    oil_change_interval_km: rest.oil_change_interval_km ?? 10000,
    oil_change_last_date: rest.oil_change_last_date ?? null,
    next_service_note: rest.next_service_note ?? null,
    document_expiries: rest.document_expiries ?? {},
  }
}

// A file the browser wants to upload: name + MIME + byte size. Size is capped
// here and re-signed into the presigned PUT so R2 rejects an oversized body.
const imageFileSchema = z.object({
  name: z.string(),
  type: z.string().startsWith('image/', 'Only image files are allowed'),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Image is too large (max 8 MB)'),
})

const imageUploadBodySchema = imageFileSchema.extend({
  base64: z.string().min(1),
})

// Normalize optional form values to null for the DB.
function nulls<T extends Record<string, unknown>>(obj: T) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === undefined ? null : v
  return out
}

export const listVehicles = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Vehicle[]> => {
    const { supabase } = await requireAgencyContext()
    const today = agencyToday()
    const [{ data, error }, { data: res }] = await Promise.all([
      supabase.from('vehicles').select(VEHICLE_SELECT).order('created_at', { ascending: false }),
      supabase
        .from('reservations')
        .select('vehicle_id, date_start, date_end, status')
        .neq('status', 'cancelled')
        .neq('status', 'closed')
        .gte('date_end', today),
    ])
    if (error) throw new Error(error.message)

    // Self-heal: derive live status from bookings so a car whose rental started
    // today shows "rented" even if no mutation ran to re-sync it.
    const byVehicle = new Map<string, any[]>()
    for (const r of (res ?? []) as any[]) {
      const list = byVehicle.get(r.vehicle_id) ?? []
      list.push(r)
      byVehicle.set(r.vehicle_id, list)
    }
    return (data ?? []).map((row: any) => {
      const v = mapVehicle(row)
      v.status = deriveVehicleStatus(byVehicle.get(v.id) ?? [], today, v.status)
      return v
    })
  },
)

export const getVehicle = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Vehicle | null> => {
    const { supabase } = await requireAgencyContext()
    const { data: row, error } = await supabase
      .from('vehicles')
      .select(VEHICLE_SELECT)
      .eq('id', data.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return row ? mapVehicle(row) : null
  })

// Temporary bulk importer: accepts an array of raw vehicle objects (as pasted
// JSON), validates each independently so one bad row doesn't sink the batch,
// inserts the valid ones, and reports per-row errors.
export const bulkImportVehicles = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ items: z.array(z.record(z.string(), z.unknown())).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ inserted: number; errors: { row: number; message: string }[] }> => {
    const { supabase, agencyId } = await requireAgencyContext()

    const payloads: Record<string, unknown>[] = []
    const errors: { row: number; message: string }[] = []

    data.items.forEach((raw, i) => {
      const parsed = vehicleSchema.safeParse(raw)
      if (!parsed.success) {
        const first = parsed.error.issues[0]
        errors.push({ row: i + 1, message: `${first.path.join('.') || 'row'}: ${first.message}` })
        return
      }
      payloads.push({
        ...nulls(parsed.data),
        document_expiries: parsed.data.document_expiries ?? {},
        agency_id: agencyId,
      })
    })

    let inserted = 0
    if (payloads.length > 0) {
      const { error, count } = await supabase
        .from('vehicles')
        .insert(payloads, { count: 'exact' })
      if (error) throw new Error(error.message)
      inserted = count ?? payloads.length
    }
    return { inserted, errors }
  })

export const createVehicle = createServerFn({ method: 'POST' })
  .validator((d: unknown) => vehicleSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    const payload = { ...nulls(data), document_expiries: data.document_expiries ?? {}, agency_id: agencyId }
    const { data: row, error } = await supabase
      .from('vehicles')
      .insert(payload)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    scheduleNotify(() => notifyVehicle(agencyId, (row as any).id, true)) // fire-and-forget email
    scheduleNotify(() => enqueueVehicleNotification(agencyId, (row as any).id))
    return { id: (row as any).id as string }
  })

export const updateVehicle = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    vehicleSchema.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, agencyId } = await requireAgencyContext()
    // `status` is derived from bookings / managed via setVehicleStatus — never
    // let the edit form overwrite it (that would re-fake availability).
    //
    // The odometer + legacy oil snapshot are OWNED by the maintenance flow
    // (service log / quick check / contract return / the odometer strip). Editing
    // a car's identity must never silently reset the km — that was a duplicate
    // edit point that let the number drift. Strip them from the edit payload.
    const {
      id,
      status: _ignoredStatus,
      mileage_current: _ignoredKm,
      oil_change_last_km: _ignoredOilKm,
      oil_change_last_date: _ignoredOilDate,
      oil_change_interval_km: _ignoredOilInterval,
      ...rest
    } = data
    const payload = { ...nulls(rest), document_expiries: rest.document_expiries ?? {} }
    const { error } = await supabase.from('vehicles').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    scheduleNotify(() => notifyVehicle(agencyId, id, false)) // fire-and-forget email
    return { ok: true }
  })

// Only availability that an owner legitimately toggles by hand. `rented` and
// `reserved` are derived from bookings (see syncVehicleStatus) and must never
// be set manually — otherwise a car looks rented with no reservation behind it.
export const MANUAL_VEHICLE_STATUSES = ['available', 'maintenance'] as const

export const setVehicleStatus = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(MANUAL_VEHICLE_STATUSES) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    // Guard: refuse to free a car that is currently out on a live booking.
    if (data.status === 'available') {
      const today = agencyToday()
      const { data: live } = await supabase
        .from('reservations')
        .select('id')
        .eq('vehicle_id', data.id)
        .not('status', 'in', '(cancelled,closed,blocked)')
        .lte('date_start', today)
        .gte('date_end', today)
        .limit(1)
      if (live && live.length > 0) throw new Error('This car is on an active booking — close the rental first.')
    }
    const { error } = await supabase
      .from('vehicles')
      .update({ status: data.status })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// Update a single legal expiry (insurance / vignette / visite / custom doc) from
// the per-item "suivi" popup — a focused one-field write, no full edit form.
const LEGAL_EXPIRY_COLS: Record<string, string> = {
  insurance: 'insurance_expiry',
  vignette: 'vignette_expiry',
  visite: 'visite_tech_expiry',
}

export const setVehicleExpiry = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        vehicle_id: z.string().uuid(),
        code: z.string().min(1),
        date: z.preprocess((v) => (v === '' || v == null ? null : v), z.string().nullable()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    const col = LEGAL_EXPIRY_COLS[data.code]
    if (col) {
      const patch: Record<string, unknown> = { [col]: data.date }
      const { error } = await supabase.from('vehicles').update(patch).eq('id', data.vehicle_id)
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    // Custom document type → merge into the document_expiries jsonb.
    const { data: v } = await supabase
      .from('vehicles')
      .select('document_expiries')
      .eq('id', data.vehicle_id)
      .maybeSingle()
    const exp = { ...(((v as any)?.document_expiries as Record<string, string | null>) ?? {}), [data.code]: data.date }
    const patch: Record<string, unknown> = { document_expiries: exp }
    const { error } = await supabase.from('vehicles').update(patch).eq('id', data.vehicle_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const deleteVehicle = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await requireAgencyContext()
    // Capture image keys before the row is gone so we can purge R2.
    const { data: veh } = await supabase
      .from('vehicles')
      .select('image_keys')
      .eq('id', data.id)
      .maybeSingle()
    const { error } = await supabase.from('vehicles').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
    await bestEffortDelete((veh as any)?.image_keys ?? [])
    return { ok: true }
  })

// Delete a vehicle AND everything that references it, in FK-safe order, so the
// owner never hits a raw "violates foreign key" error. Contracts → damage
// reports → reservations → the vehicle itself.
export const deleteVehicleCascade = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; reservations: number; contracts: number }> => {
    const { supabase } = await requireAgencyContext()

    // Gather the R2 keys of everything we're about to delete FIRST — once the
    // rows are gone we can't recover them, and leaving the objects behind means
    // orphaned PII (ID scans, contract PDFs, damage photos) in storage forever.
    const { data: veh } = await supabase
      .from('vehicles')
      .select('image_keys')
      .eq('id', data.id)
      .maybeSingle()

    const { data: res, error: resErr } = await supabase
      .from('reservations')
      .select('id')
      .eq('vehicle_id', data.id)
    if (resErr) throw new Error(resErr.message)
    const resIds = (res ?? []).map((r: any) => r.id as string)

    const { data: dmg } = await supabase
      .from('damage_reports')
      .select('photo_keys')
      .eq('vehicle_id', data.id)

    let contracts = 0
    let pdfKeys: string[] = []
    if (resIds.length > 0) {
      const { data: cons } = await supabase
        .from('contracts')
        .select('id, pdf_key')
        .in('reservation_id', resIds)
      contracts = (cons ?? []).length
      pdfKeys = (cons ?? []).map((c: any) => c.pdf_key).filter(Boolean)
      const { error: cErr } = await supabase.from('contracts').delete().in('reservation_id', resIds)
      if (cErr) throw new Error(cErr.message)
    }

    // damage_reports.vehicle_id has no cascade → clear it explicitly.
    const { error: dErr } = await supabase.from('damage_reports').delete().eq('vehicle_id', data.id)
    if (dErr) throw new Error(dErr.message)

    const { error: rErr } = await supabase.from('reservations').delete().eq('vehicle_id', data.id)
    if (rErr) throw new Error(rErr.message)

    const { error: vErr } = await supabase.from('vehicles').delete().eq('id', data.id)
    if (vErr) throw new Error(vErr.message)

    // Purge storage after the DB rows are gone (best effort, never blocks).
    const damagePhotos = (dmg ?? []).flatMap((d: any) => (d.photo_keys ?? []) as string[])
    await bestEffortDelete([...((veh as any)?.image_keys ?? []), ...damagePhotos]) // public bucket
    await bestEffortDelete(pdfKeys) // contracts now in the public locar bucket

    return { ok: true, reservations: resIds.length, contracts }
  })

// Presign direct-to-R2 PUT URLs for vehicle photos.
export const presignVehicleUploads = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        files: z
          .array(imageFileSchema)
          .min(1)
          .max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId } = await requireAgencyContext()
    const out: { key: string; url: string }[] = []
    for (const f of data.files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      const key = `agencies/${agencyId}/vehicles/photos/${crypto.randomUUID()}-${safe}`
      out.push({ key, url: await presignUpload(key, f.type, 300, f.size) })
    }
    return out
  })

// ── Damage reports ─────────────────────────────────────
// Fallback for browsers/environments where direct-to-R2 PUT is blocked by CORS
// or network policy. It is slower than presigned upload but keeps uploads usable.
export const uploadVehicleImages = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        files: z.array(imageUploadBodySchema).min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId } = await requireAgencyContext()
    const out: { key: string }[] = []
    for (const f of data.files) {
      const bytes = Buffer.from(f.base64, 'base64')
      if (bytes.byteLength !== f.size) throw new Error('Image upload payload is invalid')
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      const key = `agencies/${agencyId}/vehicles/photos/${crypto.randomUUID()}-${safe}`
      await putObject(key, bytes, f.type)
      out.push({ key })
    }
    return out
  })

export type DamageReport = {
  id: string
  vehicle_id: string
  contract_id: string | null
  type: string
  photo_keys: string[]
  photo_urls: string[]
  notes: string | null
  recorded_at: string
}

// Presign direct-to-R2 PUT URLs. Browser uploads bytes straight to R2.
export const presignDamageUploads = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        vehicle_id: z.string().uuid(),
        files: z
          .array(imageFileSchema)
          .min(1)
          .max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { agencyId } = await requireAgencyContext()
    const out: { key: string; url: string }[] = []
    for (const f of data.files) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      const key = `agencies/${agencyId}/vehicles/${data.vehicle_id}/damage/${crypto.randomUUID()}-${safe}`
      out.push({ key, url: await presignUpload(key, f.type, 300, f.size) })
    }
    return out
  })

export const createDamageReport = createServerFn({ method: 'POST' })
  .validator((d: unknown) => damageReportSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabase, agencyId, memberId } = await requireAgencyContext()
    const { error } = await supabase.from('damage_reports').insert({
      agency_id: agencyId,
      vehicle_id: data.vehicle_id,
      contract_id: data.contract_id ?? null,
      type: data.type,
      photo_keys: data.photo_keys,
      notes: data.notes ?? null,
      recorded_by: memberId,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const listDamageReports = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ vehicle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<DamageReport[]> => {
    const { supabase } = await requireAgencyContext()
    const { data: rows, error } = await supabase
      .from('damage_reports')
      .select('*')
      .eq('vehicle_id', data.vehicle_id)
      .order('recorded_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((rows ?? []) as any[]).map((r) => ({
      ...r,
      photo_urls: (r.photo_keys ?? []).map((k: string) => publicUrl(k)),
    })) as DamageReport[]
  })
