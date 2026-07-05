import { useState } from 'react'
import { Upload, Copy, FileText, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { bulkImportVehicles } from '~/server/fleet'
import { SlideOver, Button, Textarea } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

// Sample the user can copy/adapt. Covers every supported field. No images.
const SAMPLE = [
  {
    plate: '12345-A-6',
    brand: 'Dacia',
    model: 'Logan',
    year: 2022,
    category: 'economy',
    daily_rate: 250,
    status: 'available',
    mileage_current: 48000,
    insurance_expiry: '2026-11-30',
    vignette_expiry: '2026-12-31',
    visite_tech_expiry: '2026-09-15',
    oil_change_last_km: 45000,
    oil_change_interval_km: 10000,
    oil_change_last_date: '2026-03-01',
    next_service_note: 'Check brake pads next service',
    notes: 'Front bumper scratch',
  },
  {
    plate: '67890-B-1',
    brand: 'Renault',
    model: 'Clio',
    year: 2023,
    category: 'economy',
    daily_rate: 300,
    status: 'available',
    mileage_current: 22000,
    insurance_expiry: '2027-01-20',
    vignette_expiry: '2026-12-31',
    visite_tech_expiry: '2027-02-10',
  },
]

const SAMPLE_JSON = JSON.stringify(SAMPLE, null, 2)

export function BulkImportVehicles({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([])

  async function run() {
    setErrors([])
    let items: unknown
    try {
      items = JSON.parse(text)
    } catch (e: any) {
      const detail = e?.message ? `: ${e.message}` : ''
      toast.error(`${t('fleet.invalidJson')}${detail}`)
      setErrors([{ row: 0, message: e?.message ?? t('fleet.invalidJson') }])
      return
    }
    if (!Array.isArray(items)) {
      toast.error(t('fleet.mustBeArray'))
      return
    }
    setBusy(true)
    try {
      const res = await bulkImportVehicles({ data: { items: items as any } })
      setErrors(res.errors)
      if (res.inserted > 0) {
        toast.success(t('fleet.imported', { n: res.inserted }))
        onImported()
      }
      if (res.errors.length === 0) {
        setText('')
        onOpenChange(false)
      } else if (res.inserted === 0) {
        toast.error(t('fleet.importAllFailed'))
      }
    } catch (err: any) {
      toast.error(err?.message ?? t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title={t('fleet.importTitle')} description={t('fleet.importDesc')}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setText(SAMPLE_JSON)}>
            <FileText className="h-4 w-4" /> {t('fleet.loadSample')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(SAMPLE_JSON)
              toast.success(t('fleet.copied'))
            }}
          >
            <Copy className="h-4 w-4" /> {t('fleet.copySample')}
          </Button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder={t('fleet.pasteHere')}
          className="font-mono text-xs"
        />

        {errors.length > 0 && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/40 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-danger)]">
              <AlertTriangle className="h-4 w-4" /> {t('fleet.importErrors', { n: errors.length })}
            </div>
            <ul className="mt-1.5 space-y-1 pl-6 text-xs text-[var(--color-ink-soft)]">
              {errors.slice(0, 30).map((e, i) => (
                <li key={i} className="list-disc">
                  {t('fleet.rowN', { n: e.row })}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Demo / reference */}
        <details className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)]/50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[var(--color-ink-soft)]">
            {t('fleet.sampleTitle')}
          </summary>
          <pre className="max-h-72 overflow-auto border-t border-[var(--color-line)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
            {SAMPLE_JSON}
          </pre>
        </details>

        <p className="text-xs text-[var(--color-muted)]">{t('fleet.importFields')}</p>

        <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-2 border-t border-[var(--color-line)] bg-white/90 px-5 py-3 backdrop-blur">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={run} loading={busy} disabled={!text.trim()}>
            <Upload className="h-4 w-4" /> {t('fleet.import')}
          </Button>
        </div>
      </div>
    </SlideOver>
  )
}
