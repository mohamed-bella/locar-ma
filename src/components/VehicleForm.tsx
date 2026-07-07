import { useState } from 'react'
import { Car, Coins, FileText, Camera, Wrench } from 'lucide-react'
import type { Vehicle } from '~/server/fleet'
import type { DocumentType } from '~/server/documentTypes'
import { VEHICLE_CATEGORIES } from '~/lib/schemas'
import { Button, Field, Input, Select, Textarea } from '~/components/ui'
import { NumberField } from '~/components/ui/NumberField'
import { DateField } from '~/components/ui/DateField'
import { ImageUploader } from '~/components/ImageUploader'
import { BrandSelect } from '~/components/BrandSelect'
import { useI18n } from '~/lib/i18n'

export type VehicleValues = Record<string, unknown>

export function VehicleForm({
  initial,
  submitLabel,
  documentTypes = [],
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Vehicle>
  submitLabel: string
  documentTypes?: DocumentType[]
  onSubmit: (values: VehicleValues) => Promise<void>
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [imageKeys, setImageKeys] = useState<string[]>(initial?.image_keys ?? [])
  // Odometer + maintenance baseline are only set when ADDING a car. Once it
  // exists, the km is owned by the maintenance flow (Suivi / service log /
  // contract return) — editing identity must not be a second place to change it.
  const isEdit = Boolean(initial)

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fd = new FormData(e.currentTarget)
    const raw = Object.fromEntries(fd.entries())

    // Extract dynamic custom expiries
    const document_expiries: Record<string, string | null> = {}
    const rest: Record<string, any> = {}

    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('doc_expiry_')) {
        const code = k.replace('doc_expiry_', '')
        document_expiries[code] = v === '' ? null : (v as string)
      } else {
        rest[k] = v
      }
    }

    const values = {
      ...rest,
      image_keys: imageKeys,
      document_expiries,
    }
    try {
      await onSubmit(values)
    } catch (err: any) {
      setError(err?.message ?? t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const initialImages = (initial?.image_keys ?? []).map((key, i) => ({
    key,
    url: initial?.image_urls?.[i] ?? '',
  }))

  return (
    <form onSubmit={handle} className="space-y-8">
      <Section icon={Car} title={t('vf.identity')} desc={t('vf.identityDesc')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('vf.plate')} required>
            <Input name="plate" defaultValue={initial?.plate ?? ''} placeholder="12345-A-6" required />
          </Field>
          <Field label={t('vd.category')}>
            <Select name="category" defaultValue={initial?.category ?? ''}>
              <option value="">{t('vf.uncategorized')}</option>
              {VEHICLE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('vf.brand')}>
            <BrandSelect
              initialId={initial?.brand_id}
              initialName={initial?.brand}
              initialLogoUrl={initial?.brand_logo_url}
            />
          </Field>
          <Field label={t('vf.model')}>
            <Input name="model" defaultValue={initial?.model ?? ''} placeholder="Logan" />
          </Field>
          <Field label={t('vf.year')}>
            <NumberField name="year" defaultValue={initial?.year} decimalScale={0} placeholder="2022" />
          </Field>
          {!isEdit && (
            <Field label={t('vd.mileage')} hint={t('vf.mileageHint')}>
              <NumberField name="mileage_current" defaultValue={initial?.mileage_current ?? 0} decimalScale={0} suffix=" km" />
            </Field>
          )}
        </div>
      </Section>

      <Section icon={Coins} title={t('vf.pricing')} desc={t('vf.pricingDesc')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('vd.dailyRate')} required>
            <NumberField name="daily_rate" defaultValue={initial?.daily_rate} suffix=" MAD" placeholder="250" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">{t('vf.statusAuto')}</p>
      </Section>

      <Section icon={FileText} title={t('vf.documents')} desc={t('vf.documentsDesc')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('vd.insurance')}>
            <DateField name="insurance_expiry" defaultValue={initial?.insurance_expiry} />
          </Field>
          <Field label={t('vd.vignette')}>
            <DateField name="vignette_expiry" defaultValue={initial?.vignette_expiry} />
          </Field>
          <Field label="Visite technique">
            <DateField name="visite_tech_expiry" defaultValue={initial?.visite_tech_expiry} />
          </Field>
          {documentTypes.map((dt) => (
            <Field key={dt.id} label={dt.name}>
              <DateField
                name={`doc_expiry_${dt.code}`}
                defaultValue={initial?.document_expiries?.[dt.code]}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section icon={Wrench} title={t('vf.maintenance')} desc={t('vf.maintenanceDesc')}>
        {!isEdit && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('vd.lastServiceKm')} hint={t('vf.oilLastKmHint')}>
              <NumberField
                name="oil_change_last_km"
                defaultValue={initial?.oil_change_last_km ?? undefined}
                decimalScale={0}
                suffix=" km"
                placeholder="0"
              />
            </Field>
            <Field label={t('vf.oilInterval')} hint={t('vf.oilIntervalHint')}>
              <NumberField
                name="oil_change_interval_km"
                defaultValue={initial?.oil_change_interval_km ?? 10000}
                decimalScale={0}
                suffix=" km"
              />
            </Field>
            <Field label={t('vf.oilLastDate')}>
              <DateField name="oil_change_last_date" defaultValue={initial?.oil_change_last_date} />
            </Field>
          </div>
        )}
        <Field label={t('vf.serviceNote')} hint={t('vf.serviceNoteHint')} className={isEdit ? '' : 'mt-4'}>
          <Input name="next_service_note" defaultValue={initial?.next_service_note ?? ''} placeholder={t('vf.serviceNotePlaceholder')} />
        </Field>
      </Section>

      <Section icon={Camera} title={t('vd.photos')} desc={t('vf.photosDesc')}>
        <ImageUploader initial={initialImages} onChange={setImageKeys} />
      </Section>

      <Field>
        <Textarea name="notes" defaultValue={initial?.notes ?? ''} rows={2} placeholder={t('vf.notesPlaceholder')} />
      </Field>

      {error && <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>}

      <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-2 border-t border-[var(--color-line)] bg-white/90 px-5 py-3 backdrop-blur">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h4>
          <p className="text-xs text-[var(--color-muted)]">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
