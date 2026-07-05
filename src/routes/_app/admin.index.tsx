import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { format } from 'date-fns'
import { Building2, Users, Car, AlertTriangle, Power } from 'lucide-react'
import { toast } from 'sonner'
import { listAgencies, setAgencyActive, type AgencyOverview } from '~/server/platform'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, PageHeader, StatCard, cn } from '~/components/ui'

export const Route = createFileRoute('/_app/admin/')({
  beforeLoad: ({ context }) => {
    if (!(context as any).auth?.isPlatformAdmin) throw redirect({ to: '/dashboard' })
  },
  loader: async () => ({ agencies: await listAgencies() }),
  component: AdminAgencies,
})

const subTone = (s: string): 'ok' | 'info' | 'warn' | 'danger' | 'neutral' =>
  s === 'active' ? 'ok' : s === 'trial' ? 'info' : s === 'past_due' ? 'warn' : s === 'suspended' ? 'danger' : 'neutral'

const mad = (n: number) => `${n.toLocaleString()} MAD`

function AdminAgencies() {
  const { agencies } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useI18n()

  const totalMrr = agencies.filter((a) => a.subscription_status === 'active').reduce((s, a) => s + a.monthly_fee, 0)
  const overdue = agencies.filter((a) => a.overdue).length
  const activeCount = agencies.filter((a) => a.is_active).length

  async function toggle(a: AgencyOverview, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await setAgencyActive({ data: { id: a.id, active: !a.is_active } })
      toast.success(t('adm.saved'))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }

  return (
    <div>
      <PageHeader title={t('adm.title')} subtitle={t('adm.subtitle', { n: agencies.length })} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t('adm.agencies')} value={agencies.length} icon={Building2} tone="brand" />
        <StatCard label={t('adm.activeAgencies')} value={activeCount} icon={Power} tone="ok" />
        <StatCard label={t('adm.mrr')} value={mad(totalMrr)} icon={Users} tone="info" />
        <StatCard
          label={t('adm.overdue')}
          value={overdue}
          icon={AlertTriangle}
          tone="warn"
          hint={overdue > 0 ? t('adm.overdueHint') : t('adm.allPaid')}
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-[var(--color-faint)]">
              <th className="px-4 py-3 font-medium">{t('adm.agency')}</th>
              <th className="px-2 py-3 font-medium">{t('adm.plan')}</th>
              <th className="px-2 py-3 font-medium">{t('adm.nextPayment')}</th>
              <th className="px-2 py-3 text-right font-medium">{t('adm.fee')}</th>
              <th className="px-2 py-3 text-center font-medium">{t('adm.fleet')}</th>
              <th className="px-2 py-3 text-center font-medium">{t('adm.users')}</th>
              <th className="px-2 py-3 text-right font-medium">{t('dash.revMonth')}</th>
              <th className="px-2 py-3 font-medium">{t('adm.active')}</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr
                key={a.id}
                onClick={() => navigate({ to: '/admin/$agencyId', params: { agencyId: a.id } })}
                className={cn(
                  'cursor-pointer border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-muted)]',
                  !a.is_active && 'opacity-55',
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-semibold text-[var(--color-ink)]">{a.name}</div>
                  <div className="text-xs text-[var(--color-muted)]">{a.city ?? '—'}</div>
                </td>
                <td className="px-2 py-3">
                  <Badge tone={subTone(a.subscription_status)}>{t(`adm.st_${a.subscription_status}`)}</Badge>
                </td>
                <td className="px-2 py-3">
                  <span className={cn('text-xs tnum', a.overdue ? 'font-bold text-[var(--color-danger)]' : 'text-[var(--color-muted)]')}>
                    {a.next_payment_date ? format(new Date(`${a.next_payment_date}T00:00:00`), 'd MMM yyyy') : '—'}
                  </span>
                </td>
                <td className="px-2 py-3 text-right tnum">{a.monthly_fee ? mad(a.monthly_fee) : '—'}</td>
                <td className="px-2 py-3 text-center tnum">
                  <span className="inline-flex items-center gap-1 text-[var(--color-muted)]">
                    <Car className="h-3.5 w-3.5" /> {a.vehicles}
                  </span>
                </td>
                <td className="px-2 py-3 text-center tnum text-[var(--color-muted)]">{a.members}</td>
                <td className="px-2 py-3 text-right font-semibold tnum text-[var(--color-ink)]">{mad(a.revMonth)}</td>
                <td className="px-2 py-3">
                  <Button size="sm" variant={a.is_active ? 'secondary' : 'primary'} onClick={(e) => toggle(a, e)}>
                    {a.is_active ? t('adm.deactivate') : t('adm.activate')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
