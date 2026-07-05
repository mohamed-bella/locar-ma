import { useState } from 'react'
import { toast } from 'sonner'
import { createClient, checkBlacklist, type Client } from '~/server/clients'
import { Modal, Button, Field, Input } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

// Quick-create a client inline (full CRM lives in Phase 5).
export function AddClientDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
  onCreated: (client: Client) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const cin = String(fd.get('cin_passport') ?? '').trim()
    setBusy(true)
    try {
      if (cin) {
        const matches = await checkBlacklist({ data: { cin } })
        const bad = matches.find((m) => m.status === 'blacklisted') ?? matches[0]
        if (bad) {
          const proceed = confirm(
            t('cli.blacklistPrefix', { status: t(`cstatus.${bad.status}`) }) +
              (bad.blacklist_reason ? `: "${bad.blacklist_reason}"` : '') +
              (bad.blacklist_date ? ` (${t('cli.flaggedOn', { date: bad.blacklist_date })})` : '') +
              `\n\n${t('cli.createAnyway')}`,
          )
          if (!proceed) {
            setBusy(false)
            return
          }
        }
      }
      const client = await createClient({
        data: {
          full_name: String(fd.get('full_name') ?? ''),
          phone: String(fd.get('phone') ?? '') || undefined,
          cin_passport: String(fd.get('cin_passport') ?? '') || undefined,
          nationality: String(fd.get('nationality') ?? '') || undefined,
        },
      })
      toast.success(t('cli.clientAdded', { name: client.full_name }))
      onCreated(client)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.message ?? t('cli.couldNotAdd'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('cli.newClient')} description={t('cli.essentials')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('cli.fullName')} required>
          <Input name="full_name" defaultValue={defaultName} placeholder="Youssef Alaoui" autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('cli.phone')}>
            <Input name="phone" placeholder="+212 6 …" />
          </Field>
          <Field label={t('cli.cin')}>
            <Input name="cin_passport" placeholder="AB123456" />
          </Field>
        </div>
        <Field label={t('cli.nationality')}>
          <Input name="nationality" placeholder={t('cli.moroccan')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('cli.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
