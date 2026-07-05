import { useState } from 'react'
import { createFileRoute, Link, useRouter, notFound } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowLeft, Users, ShieldAlert, ShieldCheck, Flag, Loader2, History } from 'lucide-react'
import { toast } from 'sonner'
import { getClient, updateClient, setClientStatus } from '~/server/clients'
import { clientStatusTone } from '~/lib/clients'
import { resBadgeTone } from '~/lib/reservations'
import { useI18n } from '~/lib/i18n'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Field,
  Input,
  EmptyState,
} from '~/components/ui'

export const Route = createFileRoute('/_app/clients/$clientId')({
  loader: async ({ params }) => {
    const data = await getClient({ data: { id: params.clientId } })
    if (!data) throw notFound()
    return data
  },
  component: ClientDetail,
  pendingComponent: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
    </div>
  ),
  notFoundComponent: ClientNotFound,
})

function ClientNotFound() {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={Users}
      title={t('cli.notFound')}
      action={
        <Link to="/clients">
          <Button variant="secondary">{t('cli.backToClients')}</Button>
        </Link>
      }
    />
  )
}

function ClientDetail() {
  const { client: c, history } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setSaving(true)
    try {
      await updateClient({
        data: {
          id: c.id,
          full_name: String(fd.get('full_name') ?? ''),
          cin_passport: String(fd.get('cin_passport') ?? '') || undefined,
          phone: String(fd.get('phone') ?? '') || undefined,
          email: String(fd.get('email') ?? '') || undefined,
          nationality: String(fd.get('nationality') ?? '') || undefined,
          address: String(fd.get('address') ?? '') || undefined,
        },
      })
      toast.success(t('cli.saved'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('cli.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(status: 'active' | 'flagged' | 'blacklisted') {
    let reason: string | undefined
    if (status !== 'active') {
      reason = prompt(status === 'blacklisted' ? t('cli.reasonBlacklist') : t('cli.reasonFlag')) ?? undefined
      if (reason === undefined) return
    }
    try {
      await setClientStatus({ data: { id: c.id, status, reason } })
      toast.success(status === 'active' ? t('cli.cleared') : t('cli.statusSet', { status: t(`cstatus.${status}`) }))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('cli.couldNotStatus'))
    }
  }

  const totalSpent = history
    .filter((h) => h.status !== 'cancelled')
    .reduce((sum, h) => sum + (h.total_amount ?? 0), 0)

  return (
    <div className="max-w-5xl">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> {t('cli.title')}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">{c.full_name}</h1>
          <Badge tone={clientStatusTone(c.status)} dot>
            {t(`cstatus.${c.status}`)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.status !== 'active' && (
            <Button variant="secondary" onClick={() => changeStatus('active')}>
              <ShieldCheck className="h-4 w-4" /> {t('cli.clear')}
            </Button>
          )}
          {c.status === 'active' && (
            <Button variant="secondary" onClick={() => changeStatus('flagged')}>
              <Flag className="h-4 w-4" /> {t('cli.flag')}
            </Button>
          )}
          {c.status !== 'blacklisted' && (
            <Button className="bg-[var(--color-danger)] hover:brightness-95" onClick={() => changeStatus('blacklisted')}>
              <ShieldAlert className="h-4 w-4" /> {t('cli.blacklist')}
            </Button>
          )}
        </div>
      </div>

      {c.status !== 'active' && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/50 p-4 text-sm text-[var(--color-danger)]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <span className="font-semibold">{t(`cstatus.${c.status}`)}</span>
            {c.blacklist_reason ? ` — ${c.blacklist_reason}` : ''}
            {c.blacklist_date ? ` (${c.blacklist_date})` : ''}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader title={t('cli.profile')} />
          <CardBody>
            <form onSubmit={save} className="space-y-4">
              <Field label={t('cli.fullName')} required>
                <Input name="full_name" defaultValue={c.full_name} required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('cli.cin')}>
                  <Input name="cin_passport" defaultValue={c.cin_passport ?? ''} />
                </Field>
                <Field label={t('cli.phone')}>
                  <Input name="phone" defaultValue={c.phone ?? ''} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('cli.email')}>
                  <Input name="email" type="email" defaultValue={c.email ?? ''} />
                </Field>
                <Field label={t('cli.nationality')}>
                  <Input name="nationality" defaultValue={c.nationality ?? ''} />
                </Field>
              </div>
              <Field label={t('cli.address')}>
                <Input name="address" defaultValue={c.address ?? ''} />
              </Field>
              <Button type="submit" loading={saving}>
                {t('common.saveChanges')}
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* History */}
        <Card>
          <CardHeader
            title={t('cli.history')}
            subtitle={
              history.length === 1
                ? t('cli.historySubOne', { n: history.length, total: totalSpent.toLocaleString() })
                : t('cli.historySub', { n: history.length, total: totalSpent.toLocaleString() })
            }
          />
          <CardBody className="p-0">
            {history.length === 0 ? (
              <div className="px-5 py-10">
                <EmptyState icon={History} title={t('cli.noHistory')} />
              </div>
            ) : (
              <ul>
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3 last:border-0"
                  >
                    <div>
                      <div className="font-semibold text-[var(--color-ink)]">{h.vehicle_plate ?? '—'}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {format(new Date(`${h.date_start}T00:00:00`), 'd MMM')} →{' '}
                        {format(new Date(`${h.date_end}T00:00:00`), 'd MMM yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tnum">
                        {(h.total_amount ?? 0).toLocaleString()} MAD
                      </span>
                      <Badge tone={resBadgeTone(h.status)}>{t(`rstatus.${h.status}`)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
