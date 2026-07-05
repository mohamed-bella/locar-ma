import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns'
import { Wallet, CalendarDays, TrendingUp, Coins, Download, Car, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getFinanceSummary, exportBookingsCsv } from '~/server/finance'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { StatCard, Card, CardHeader, CardBody, Badge, Button, PageHeader, EmptyState } from '~/components/ui'

export const Route = createFileRoute('/_app/finance')({
  loader: async () => ({ summary: await getFinanceSummary() }),
  component: Finance,
  pendingComponent: FinancePending,
})

function FinancePending() {
  const { t } = useI18n()
  return (
    <div>
      <PageHeader title={t('fin.title')} subtitle={t('common.loading')} />
    </div>
  )
}

const mad = (n: number) => `${n.toLocaleString()} MAD`
const fmt = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM')

function Finance() {
  const { summary: s } = Route.useLoaderData()
  const { t } = useI18n()
  useRealtimeInvalidate('reservations')

  async function exportCsv() {
    try {
      const csv = await exportBookingsCsv()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `locar-bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('fin.csvDone'))
    } catch (err: any) {
      toast.error(err?.message ?? t('fin.csvFailed'))
    }
  }

  const maxVehicle = Math.max(1, ...s.perVehicle.map((v) => v.total))

  return (
    <div>
      <PageHeader
        title={t('fin.title')}
        subtitle={t('fin.subtitle')}
        actions={
          <Button variant="secondary" size="lg" onClick={exportCsv}>
            <Download className="h-[18px] w-[18px]" /> {t('fin.exportCsv')}
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('fin.today')} value={mad(s.revToday)} icon={Wallet} tone="brand" />
        <StatCard label={t('fin.thisWeek')} value={mad(s.revWeek)} icon={CalendarDays} tone="info" />
        <StatCard label={t('fin.thisMonth')} value={mad(s.revMonth)} icon={TrendingUp} tone="ok" />
        <StatCard label={t('fin.allTime')} value={mad(s.revTotal)} icon={Coins} tone="warn" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Revenue per vehicle */}
        <Card>
          <CardHeader title={t('fin.revPerVehicle')} subtitle={t('fin.mostProfitable')} />
          <CardBody className="space-y-3">
            {s.perVehicle.length === 0 ? (
              <EmptyState icon={Car} title={t('fin.noRevenue')} />
            ) : (
              s.perVehicle.map((v) => (
                <div key={v.vehicle_id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[var(--color-ink)]">{v.plate}</span>
                    <span className="tnum text-[var(--color-ink-soft)]">
                      {mad(v.total)} · {v.count} {v.count === 1 ? t('fin.booking') : t('fin.bookings')}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)] shadow-[inset_0_1px_2px_rgba(16,24,40,0.08)]">
                    <div
                      className="skeu-meter-fill h-full rounded-full"
                      style={{ width: `${(v.total / maxVehicle) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Upcoming + overdue */}
        <div className="space-y-5">
          {s.overdue.length > 0 && (
            <Card className="border-[var(--color-danger)]/30">
              <CardHeader
                title={
                  <span className="flex items-center gap-2 text-[var(--color-danger)]">
                    <AlertTriangle className="h-4 w-4" /> {t('fin.overdueReturns')}
                  </span>
                }
                subtitle={
                  s.overdue.length === 1
                    ? t('fin.notReturnedOne', { n: s.overdue.length })
                    : t('fin.notReturned', { n: s.overdue.length })
                }
              />
              <CardBody className="p-0">
                <BookingList rows={s.overdue} danger />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t('fin.upcomingReturns')} subtitle={t('fin.nextReturns')} />
            <CardBody className="p-0">
              {s.upcoming.length === 0 ? (
                <div className="px-5 py-10">
                  <EmptyState icon={CalendarDays} title={t('fin.nothingUpcoming')} />
                </div>
              ) : (
                <BookingList rows={s.upcoming} />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BookingList({
  rows,
  danger,
}: {
  rows: { id: string; date_end: string; vehicle_plate: string | null; client_name: string | null; total_amount: number | null; status: string }[]
  danger?: boolean
}) {
  const { t } = useI18n()
  return (
    <ul>
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3 last:border-0"
        >
          <div>
            <div className="font-semibold text-[var(--color-ink)]">{r.vehicle_plate ?? '—'}</div>
            <div className="text-xs text-[var(--color-muted)]">{r.client_name ?? t('fin.noClient')}</div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-medium ${danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink-soft)]'}`}>
              {danger ? `${t('fin.due')} ` : `${t('fin.returns')} `}
              {fmt(r.date_end)}
            </div>
            <div className="text-xs tnum text-[var(--color-faint)]">{mad(r.total_amount ?? 0)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
