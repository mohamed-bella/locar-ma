import { useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import { logService } from '~/server/maintenance'
import { SERVICE_TYPES } from '~/lib/maintenance'
import { agencyToday } from '~/lib/tz'
import { useI18n } from '~/lib/i18n'
import { Button, Field, Input, Select, SlideOver } from '~/components/ui'

// One-tap "mark done" for a car's service. Records the event, which advances
// the schedule + odometer server-side.
export function LogServiceSheet({
  open,
  onOpenChange,
  vehicleId,
  defaultType = 'vidange',
  defaultMileage,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehicleId: string
  defaultType?: string
  defaultMileage?: number | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await logService({
        data: {
          vehicle_id: vehicleId,
          type: String(fd.get('type')),
          performed_at: String(fd.get('performed_at')),
          odometer_km: fd.get('odometer_km') ? Number(fd.get('odometer_km')) : undefined,
          cost: fd.get('cost') ? Number(fd.get('cost')) : undefined,
          garage: String(fd.get('garage') ?? '') || undefined,
          notes: String(fd.get('notes') ?? '') || undefined,
        },
      })
      toast.success(t('svc.saved'))
      onOpenChange(false)
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? t('svc.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title={t('svc.logService')} description={t('svc.subtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('svc.serviceType')} required>
          <Select name="type" defaultValue={defaultType}>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`svc.type.${s}`)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('svc.date')} required>
            <Input type="date" name="performed_at" required defaultValue={agencyToday()} />
          </Field>
          <Field label={t('svc.odometer')}>
            <Input
              type="number"
              name="odometer_km"
              inputMode="numeric"
              min={0}
              defaultValue={defaultMileage ?? undefined}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('svc.cost')}>
            <Input type="number" name="cost" inputMode="numeric" min={0} placeholder="0" />
          </Field>
          <Field label={t('svc.garage')}>
            <Input name="garage" placeholder="—" />
          </Field>
        </div>

        <Field label={t('svc.notesOpt')}>
          <Input name="notes" placeholder="—" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            <Wrench className="h-4 w-4" /> {t('svc.logService')}
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
