import { useState } from 'react'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { createIssue, presignIssueUploads } from '~/server/intelligence'
import { useI18n } from '~/lib/i18n'
import { Button, Field, Input, Textarea, Select, SlideOver } from '~/components/ui'
import { PngIcon } from './Icon'

const KINDS = ['problem', 'accident', 'garage', 'admin', 'cleaning'] as const
const CATEGORIES = ['mechanical', 'electrical', 'body', 'tyres', 'brakes', 'other'] as const
const SEVERITIES = ['low', 'medium', 'critical'] as const

// Declare a problem / accident, or send the car to the garage. The engine turns
// this into a block or an alert automatically based on kind + severity.
export function IssueDialog({
  open,
  onOpenChange,
  vehicleId,
  defaultKind = 'problem',
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehicleId: string
  defaultKind?: string
  onDone: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [blocks, setBlocks] = useState(false)

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
      await createIssue({
        data: {
          vehicle_id: vehicleId,
          kind: String(fd.get('kind')) as any,
          category: String(fd.get('category') ?? '') || undefined,
          severity: String(fd.get('severity')) as any,
          blocks_rental: blocks,
          title: String(fd.get('title')),
          description: String(fd.get('description') ?? '') || undefined,
          cost: fd.get('cost') ? Number(fd.get('cost')) : undefined,
          garage: String(fd.get('garage') ?? '') || undefined,
          photo_keys: photoKeys,
        },
      })
      toast.success(t('si.isSaved'))
      onOpenChange(false)
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title={t('si.isTitle')} description={t('si.isSub')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('si.isTitleField')} required>
          <Input name="title" required placeholder={t('si.isTitlePlaceholder')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('si.isKind')}>
            <Select name="kind" defaultValue={defaultKind}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`si.kind.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('si.isCategory')}>
            <Select name="category" defaultValue="">
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`si.cat.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('si.isSeverity')}>
            <Select name="severity" defaultValue="medium">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`si.sev.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('si.isDesc')}>
          <Textarea name="description" rows={3} placeholder="—" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('si.isCost')}>
            <Input type="number" name="cost" inputMode="numeric" min={0} placeholder="0" />
          </Field>
          <Field label={t('si.isGarage')}>
            <Input name="garage" placeholder="—" />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--color-line)] px-3.5 py-3 text-sm font-medium text-[var(--color-ink-soft)]">
          <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} className="h-4 w-4 accent-[var(--color-danger)]" />
          {t('si.isBlocks')}
        </label>

        <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-line-strong)] px-4 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]">
          <Camera className="h-4 w-4" /> {t('si.qcPhotos')}
          <input name="photos" type="file" accept="image/*" multiple capture="environment" hidden />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            <PngIcon path="action/declarer-probleme" size={16} /> {t('si.isSubmit')}
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
