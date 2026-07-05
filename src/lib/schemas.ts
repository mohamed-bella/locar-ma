import { z } from 'zod'

export const onboardingSchema = z.object({
  agencyName: z.string().min(2, 'Agency name required'),
  city: z.string().optional(),
  language: z.enum(['ar', 'fr', 'en']).default('fr'),
  fleetSize: z.coerce.number().int().min(0).optional(),
  ownerName: z.string().min(2, 'Your name required'),
  phone: z.string().optional(),
})
export type OnboardingInput = z.infer<typeof onboardingSchema>

// ── Fleet ──────────────────────────────────────────────
export const VEHICLE_CATEGORIES = [
  'mini',
  'economy',
  'compact',
  'sedan',
  'suv',
  'luxury',
  'utility',
  'van',
] as const
export const VEHICLE_STATUSES = ['available', 'rented', 'maintenance', 'reserved'] as const

// Empty string from a form field → undefined (so optional() works).
const emptyToUndef = (v: unknown) => (v === '' || v == null ? undefined : v)
const optStr = z.preprocess(emptyToUndef, z.string().optional())
const optDate = z.preprocess(emptyToUndef, z.string().optional()) // yyyy-mm-dd

export const vehicleSchema = z.object({
  plate: z.string().min(1, 'Plate required'),
  brand: optStr,
  brand_id: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  model: optStr,
  year: z.preprocess(emptyToUndef, z.coerce.number().int().min(1950).max(2100).optional()),
  // Unknown category → undefined (don't fail a bulk row over a label typo).
  category: z.preprocess((v) => {
    if (v === '' || v == null) return undefined
    return (VEHICLE_CATEGORIES as readonly string[]).includes(v as string) ? v : undefined
  }, z.enum(VEHICLE_CATEGORIES).optional()),
  daily_rate: z.coerce.number().min(0, 'Rate must be ≥ 0'),
  status: z.enum(VEHICLE_STATUSES).default('available'),
  mileage_current: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).default(0)),
  insurance_expiry: optDate,
  vignette_expiry: optDate,
  visite_tech_expiry: optDate,
  oil_change_last_km: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  oil_change_interval_km: z.preprocess(emptyToUndef, z.coerce.number().int().min(500).default(10000)),
  oil_change_last_date: optDate,
  next_service_note: optStr,
  notes: optStr,
  image_keys: z.array(z.string()).default([]),
  document_expiries: z.record(z.string(), z.string().nullable()).optional(),
})
export type VehicleInput = z.infer<typeof vehicleSchema>

export const damageReportSchema = z.object({
  vehicle_id: z.string().uuid(),
  contract_id: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  type: z.enum(['pickup', 'return']),
  photo_keys: z.array(z.string()).default([]),
  notes: optStr,
})
export type DamageReportInput = z.infer<typeof damageReportSchema>

// ── Brands (global catalog) ────────────────────────────
export const brandSchema = z.object({
  name: z.string().min(1, 'Brand name required').max(60),
  logo_key: z.preprocess(emptyToUndef, z.string().optional()),
})
export type BrandInput = z.infer<typeof brandSchema>

// ── Reservations ───────────────────────────────────────
export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'active',
  'closed',
  'cancelled',
] as const

export const reservationSchema = z
  .object({
    vehicle_id: z.string().uuid(),
    client_id: z.preprocess(emptyToUndef, z.string().uuid().optional()),
    date_start: z.string().min(1, 'Start date required'),
    date_end: z.string().min(1, 'End date required'),
    pickup_location: optStr,
    dropoff_location: optStr,
    daily_rate_snap: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
    total_amount: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
    status: z.enum(RESERVATION_STATUSES).default('confirmed'),
    notes: optStr,
  })
  .refine((d) => d.date_end >= d.date_start, {
    message: 'End date must be on or after start date',
    path: ['date_end'],
  })
export type ReservationInput = z.infer<typeof reservationSchema>

export const blockSchema = z
  .object({
    vehicle_id: z.string().uuid(),
    date_start: z.string().min(1),
    date_end: z.string().min(1),
    reason: optStr,
  })
  .refine((d) => d.date_end >= d.date_start, { path: ['date_end'] })
export type BlockInput = z.infer<typeof blockSchema>

// ── Contracts ──────────────────────────────────────────
export const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarters', 'full'] as const
export const CHECK_STATUSES = ['held', 'released', 'disputed'] as const
const optNum = z.preprocess(emptyToUndef, z.coerce.number().min(0).optional())
const optFuel = z.preprocess(emptyToUndef, z.enum(FUEL_LEVELS).optional())

export const contractUpdateSchema = z.object({
  id: z.string().uuid(),
  mileage_out: optNum,
  mileage_in: optNum,
  fuel_out: optFuel,
  fuel_in: optFuel,
  check_number: optStr,
  check_bank: optStr,
  check_amount: optNum,
  check_status: z.enum(CHECK_STATUSES).default('held'),
  extras: z
    .array(z.object({ name: z.string().min(1), price: z.coerce.number() }))
    .default([]),
})
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>

// ── Clients (minimal — full CRM in Phase 5) ────────────
export const clientQuickSchema = z.object({
  full_name: z.string().min(2, 'Name required'),
  phone: optStr,
  cin_passport: optStr,
  nationality: optStr,
})
export type ClientQuickInput = z.infer<typeof clientQuickSchema>

export const CLIENT_STATUSES = ['active', 'flagged', 'blacklisted'] as const

export const clientSchema = z.object({
  full_name: z.string().min(2, 'Name required'),
  cin_passport: optStr,
  phone: optStr,
  email: z.preprocess(emptyToUndef, z.string().email().optional()),
  nationality: optStr,
  address: optStr,
})
export type ClientInput = z.infer<typeof clientSchema>

export const clientStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CLIENT_STATUSES),
  reason: optStr,
})

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
