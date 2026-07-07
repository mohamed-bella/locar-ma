import { useState } from 'react'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { quickCheck, presignIssueUploads } from '~/server/intelligence'
import { useI18n } from '~/lib/i18n'
import { Button, Field, Input, Select, SlideOver, cn } from '~/components/ui'
import { PngIcon } from './Icon'

// The 30-second before/after-rental check. Staff records what they see; the
// server advances the odometer and opens issues from the reported faults.
export function QuickCheckDialog({
  open,
  onOpenChange,
  vehicleId,
  defaultMileage,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehicleId: string
  defaultMileage?: number | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [clean, setClean] = useState(true)
  const [tyresOk, setTyresOk] = useState(true)
  const [warningLight, setWarningLight] = useState(false)
  const [newDamage, setNewDamage] = useState(false)
  const [clientReported, setClientReported] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const files = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
    setBusy(true)
    try {
      let photoKeys: string[] = []
      if (files.length > 0) {
        const signed = await presignIssueUploads({
          data: { vehicle_id: vehicleId, files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) },
        })
        await Promise.all(
          signed.map((s, i) =>
            fetch(s.url, { method: 'PUT', body: files[i], headers: { 'Content-Type': files[i].type } }).then((r) => {
              if (!r.ok) throw new Error(`Upload failed (${r.status})`)
            }),
          ),
        )
        photoKeys = signed.map((s) => s.key)
      }
      const res = await quickCheck({
        data: {
          vehicle_id: vehicleId,
          mileage: fd.get('mileage') ? Number(fd.get('mileage')) : undefined,
          fuel: (String(fd.get('fuel') || '') || undefined) as any,
          clean,
          warning_light: warningLight,
          tyres_ok: tyresOk,
          new_damage: newDamage,
          client_reported: clientReported,
          note: String(fd.get('note') ?? '') || undefined,
          photo_keys: photoKeys,
        },
      })
      toast.success(res.issuesOpened > 0 ? t('si.qcDoneIssues', { n: res.issuesOpened }) : t('si.qcDone'))
      onOpenChange(false)
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title={t('si.qcTitle')} description={t('si.qcSub')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('si.qcMileage')}>
            <Input type="number" name="mileage" inputMode="numeric" min={0} defaultValue={defaultMileage ?? undefined} placeholder="0" />
          </Field>
          <Field label={t('si.qcFuel')}>
            <Select name="fuel" defaultValue="">
              <option value="">—</option>
              <option value="empty">{t('con.fuelEmpty')}</option>
              <option value="quarter">{t('con.fuelQuarter')}</option>
              <option value="half">{t('con.fuelHalf')}</option>
              <option value="three_quarters">{t('con.fuelThreeQuarters')}</option>
              <option value="full">{t('con.fuelFull')}</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Toggle icon="check/proprete" label={t('si.qcClean')} checked={clean} onChange={setClean} good={clean} />
          <Toggle icon="check/pneus-ok" label={t('si.qcTyres')} checked={tyresOk} onChange={setTyresOk} good={tyresOk} />
          <Toggle icon="check/voyant-moteur" label={t('si.qcWarnLight')} checked={warningLight} onChange={setWarningLight} good={!warningLight} />
          <Toggle icon="check/dommage" label={t('si.qcNewDamage')} checked={newDamage} onChange={setNewDamage} good={!newDamage} />
          <Toggle icon="check/client-signale" label={t('si.qcClientReported')} checked={clientReported} onChange={setClientReported} good={!clientReported} />
        </div>

        <Field label={t('si.qcNote')}>
          <Input name="note" placeholder="—" />
        </Field>

        <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
          <Camera className="h-4 w-4" /> {t('si.qcPhotos')}
          <input name="photos" type="file" accept="image/*" multiple capture="environment" hidden />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            <PngIcon path="action/check-rapide" size={16} /> {t('si.qcSubmit')}
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// A big tap-target toggle. `good` colours it green when the answer is the
// healthy one, red when it flags a fault — so the form reads at a glance.
function Toggle({
  label,
  checked,
  onChange,
  good,
  icon,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  good: boolean
  icon: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm font-semibold transition',
        good
          ? 'border-[var(--color-ok)]/30 bg-[var(--color-ok-soft)] text-[var(--color-ok)]'
          : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
      )}
    >
      <span className="flex items-center gap-2">
        <PngIcon path={icon} size={20} />
        {label}
      </span>
      <span
        className={cn(
          'relative h-6 w-10 rounded-full transition',
          checked ? 'bg-current' : 'bg-[var(--color-line-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'start-[1.125rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  )
}
