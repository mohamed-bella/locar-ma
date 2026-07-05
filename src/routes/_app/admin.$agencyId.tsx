import { useState } from 'react'
import { createFileRoute, redirect, Link, useRouter } from '@tanstack/react-router'
import { format } from 'date-fns'
import { ArrowLeft, Trash2, UserPlus, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAgency,
  updateAgencySubscription,
  recordPayment,
  inviteAgencyUser,
  removeAgencyMember,
} from '~/server/platform'
import { resBadgeTone } from '~/lib/reservations'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, Card, CardHeader, CardBody, Field, Input, Select, statusTone } from '~/components/ui'

export const Route = createFileRoute('/_app/admin/$agencyId')({
  beforeLoad: ({ context }) => {
    if (!(context as any).auth?.isPlatformAdmin) throw redirect({ to: '/dashboard' })
  },
  loader: async ({ params }) => getAgency({ data: { id: params.agencyId } }),
  component: AgencyDetail,
})

const mad = (n: number) => `${n.toLocaleString()} MAD`
const fmt = (d: string | null) => (d ? format(new Date(`${d}T00:00:00`), 'd MMM yyyy') : '—')

function AgencyDetail() {
  const { agency, members, vehicles, reservations, payments } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()

  return (
    <div>
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        <ArrowLeft className="h-4 w-4" /> {t('adm.title')}
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)] sm:text-[28px]">{agency.name}</h1>
        <Badge tone={agency.is_active ? 'ok' : 'neutral'} dot>
          {agency.is_active ? t('adm.activeState') : t('adm.inactiveState')}
        </Badge>
      </div>
      <div className="mt-1 text-[var(--color-muted)]">{agency.city ?? '—'}</div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <SubscriptionCard agency={agency} onSaved={() => router.invalidate()} />
        <PaymentsCard agencyId={agency.id} payments={payments} onSaved={() => router.invalidate()} />
      </div>

      <MembersCard agencyId={agency.id} members={members} onChanged={() => router.invalidate()} />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('adm.fleet')} subtitle={t('adm.nVehicles', { n: vehicles.length })} />
          <CardBody className="p-0">
            {vehicles.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">—</p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {vehicles.map((v: any) => (
                  <li key={v.id} className="flex items-center justify-between px-5 py-2.5">
                    <div>
                      <div className="font-semibold text-[var(--color-ink)]">{v.plate}</div>
                      <div className="text-xs text-[var(--color-muted)]">{v.brand ?? '—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tnum text-[var(--color-muted)]">{mad(v.daily_rate)}</span>
                      <Badge tone={statusTone(v.status)}>{t(`status.${v.status}`)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('adm.recentReservations')} />
          <CardBody className="p-0">
            {reservations.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">—</p>
            ) : (
              <ul className="max-h-96 divide-y divide-[var(--color-line)] overflow-y-auto">
                {reservations.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--color-ink)]">
                        {r.vehicle_plate ?? '—'} · {r.client_name ?? t('fin.noClient')}
                      </div>
                      <div className="text-xs tnum text-[var(--color-muted)]">
                        {fmt(r.date_start)} → {fmt(r.date_end)}
                      </div>
                    </div>
                    <Badge tone={resBadgeTone(r.status)}>{t(`rstatus.${r.status}`)}</Badge>
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

function SubscriptionCard({ agency, onSaved }: { agency: any; onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    try {
      await updateAgencySubscription({
        data: {
          id: agency.id,
          plan: String(fd.get('plan') || 'trial'),
          subscription_status: String(fd.get('subscription_status') || 'trial') as any,
          subscription_started: String(fd.get('subscription_started') || '') || undefined,
          next_payment_date: String(fd.get('next_payment_date') || '') || undefined,
          monthly_fee: Number(fd.get('monthly_fee') || 0),
        },
      })
      toast.success(t('adm.saved'))
      onSaved()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title={t('adm.subscription')} subtitle={t('adm.subscriptionSub')} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('adm.plan')}>
              <Input name="plan" defaultValue={agency.plan ?? 'trial'} placeholder="basic / pro" />
            </Field>
            <Field label={t('common.status')}>
              <Select name="subscription_status" defaultValue={agency.subscription_status ?? 'trial'}>
                {['trial', 'active', 'past_due', 'suspended'].map((s) => (
                  <option key={s} value={s}>
                    {t(`adm.st_${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('adm.started')}>
              <Input type="date" name="subscription_started" defaultValue={agency.subscription_started ?? ''} />
            </Field>
            <Field label={t('adm.nextPayment')}>
              <Input type="date" name="next_payment_date" defaultValue={agency.next_payment_date ?? ''} />
            </Field>
            <Field label={t('adm.fee')}>
              <Input type="number" name="monthly_fee" defaultValue={String(agency.monthly_fee ?? 0)} min={0} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              {t('common.saveChanges')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function PaymentsCard({ agencyId, payments, onSaved }: { agencyId: string; payments: any[]; onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setBusy(true)
    try {
      await recordPayment({
        data: {
          agency_id: agencyId,
          amount: Number(fd.get('amount') || 0),
          period: String(fd.get('period') || '') || undefined,
          method: String(fd.get('method') || '') || undefined,
          paid_at: String(fd.get('paid_at') || '') || undefined,
          next_payment_date: String(fd.get('next_payment_date') || '') || undefined,
        },
      })
      form.reset()
      toast.success(t('adm.paymentRecorded'))
      onSaved()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title={t('adm.payments')} subtitle={t('adm.paymentsSub')} />
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label={t('adm.amount')}>
            <Input type="number" name="amount" min={0} placeholder="500" required />
          </Field>
          <Field label={t('adm.period')}>
            <Input name="period" placeholder="2026-07" />
          </Field>
          <Field label={t('adm.method')}>
            <Select name="method" defaultValue="bank">
              <option value="cash">{t('adm.cash')}</option>
              <option value="bank">{t('adm.bank')}</option>
              <option value="card">{t('adm.card')}</option>
            </Select>
          </Field>
          <Field label={t('adm.paidAt')}>
            <Input type="date" name="paid_at" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
          </Field>
          <Field label={t('adm.nextPayment')} className="col-span-2">
            <Input type="date" name="next_payment_date" />
          </Field>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" loading={busy}>
              <CreditCard className="h-4 w-4" /> {t('adm.recordPayment')}
            </Button>
          </div>
        </form>

        {payments.length > 0 && (
          <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[var(--color-muted)]">
                  {fmt(p.paid_at)} {p.method ? `· ${t(`adm.${p.method}`)}` : ''} {p.period ? `· ${p.period}` : ''}
                </span>
                <span className="font-semibold tnum text-[var(--color-ink)]">{mad(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function MembersCard({ agencyId, members, onChanged }: { agencyId: string; members: any[]; onChanged: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setBusy(true)
    try {
      await inviteAgencyUser({
        data: {
          agency_id: agencyId,
          email: String(fd.get('email') || ''),
          full_name: String(fd.get('full_name') || '') || undefined,
          role: String(fd.get('role') || 'staff') as any,
        },
      })
      form.reset()
      toast.success(t('adm.userInvited'))
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm(t('adm.confirmRemove'))) return
    try {
      await removeAgencyMember({ data: { member_id: id } })
      toast.success(t('adm.userRemoved'))
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  return (
    <Card className="mt-5">
      <CardHeader title={t('adm.members')} subtitle={t('adm.membersSub')} />
      <CardBody className="space-y-4">
        <ul className="divide-y divide-[var(--color-line)]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{m.full_name ?? m.email ?? '—'}</div>
                <div className="truncate text-xs text-[var(--color-muted)]">{m.email ?? m.user_id}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{m.role}</Badge>
                <button onClick={() => remove(m.id)} className="text-[var(--color-danger)] hover:text-red-700" aria-label={t('common.delete')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {members.length === 0 && <li className="py-3 text-sm text-[var(--color-muted)]">—</li>}
        </ul>

        <form onSubmit={invite} className="grid grid-cols-1 gap-3 border-t border-[var(--color-line)] pt-4 sm:grid-cols-4">
          <Field label={t('cli.email')} className="sm:col-span-2">
            <Input type="email" name="email" placeholder="user@agency.ma" required />
          </Field>
          <Field label={t('adm.role')}>
            <Select name="role" defaultValue="staff">
              <option value="staff">staff</option>
              <option value="owner">owner</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={busy} className="w-full">
              <UserPlus className="h-4 w-4" /> {t('adm.invite')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
