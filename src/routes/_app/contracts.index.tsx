import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns'
import { FileText, FileCheck, Plus, Car, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import {
  listContracts,
  listContractableReservations,
  createContractFromReservation,
  type ContractableReservation,
} from '~/server/contracts'
import { resBadgeTone } from '~/lib/reservations'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Badge, Button, EmptyState, PageHeader, SlideOver, TableSkeleton } from '~/components/ui'

export const Route = createFileRoute('/_app/contracts/')({
  loader: async () => {
    const [contracts, contractable] = await Promise.all([
      listContracts(),
      listContractableReservations(),
    ])
    return { contracts, contractable }
  },
  component: Contracts,
  pendingComponent: ContractsPending,
})

function ContractsPending() {
  const { t } = useI18n()
  return (
    <div>
      <PageHeader title={t('con.title')} subtitle={t('common.loading')} />
      <div className="mt-6">
        <TableSkeleton rows={6} />
      </div>
    </div>
  )
}

function Contracts() {
  const { contracts, contractable } = Route.useLoaderData()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [pickOpen, setPickOpen] = useState(false)
  useRealtimeInvalidate('contracts')
  useRealtimeInvalidate('reservations')

  return (
    <div>
      <PageHeader
        title={t('con.title')}
        subtitle={contracts.length === 1 ? t('con.contractOne', { n: contracts.length }) : t('con.contracts', { n: contracts.length })}
        actions={
          <Button size="lg" disabled={contractable.length === 0} onClick={() => setPickOpen(true)}>
            <Plus className="h-[18px] w-[18px]" /> {t('con.new')}
          </Button>
        }
      />

      <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
        {contracts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('con.empty')}
            description={t('con.emptyDesc')}
            action={
              contractable.length > 0 ? (
                <Button size="lg" onClick={() => setPickOpen(true)}>
                  <Plus className="h-[18px] w-[18px]" /> {t('con.new')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-[var(--color-faint)]">
                <th className="px-4 py-3 font-medium">{t('con.number')}</th>
                <th className="px-2 py-3 font-medium">{t('common.client')}</th>
                <th className="hidden px-2 py-3 font-medium sm:table-cell">{t('common.vehicle')}</th>
                <th className="hidden px-2 py-3 font-medium sm:table-cell">{t('common.dates')}</th>
                <th className="px-2 py-3 text-right font-medium">{t('res.total')}</th>
                <th className="px-2 py-3 font-medium">{t('common.status')}</th>
                <th className="px-2 py-3 font-medium">PDF</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate({ to: '/contracts/$contractId', params: { contractId: c.id } })}
                  className="cursor-pointer border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-muted)]"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-[var(--color-ink)]">#{c.short_id}</td>
                  <td className="px-2 py-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{c.client_name ?? '—'}</span>
                      <span className="truncate text-xs text-[var(--color-muted)] sm:hidden">
                        {[
                          c.vehicle_plate,
                          c.date_start ? format(new Date(`${c.date_start}T00:00:00`), 'd MMM') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-3 sm:table-cell">{c.vehicle_plate ?? '—'}</td>
                  <td className="hidden px-2 py-3 text-xs text-[var(--color-muted)] sm:table-cell">
                    {c.date_start ? format(new Date(`${c.date_start}T00:00:00`), 'd MMM') : '—'}
                    {c.date_end ? ` → ${format(new Date(`${c.date_end}T00:00:00`), 'd MMM')}` : ''}
                  </td>
                  <td className="px-2 py-3 text-right font-semibold tnum">
                    {c.total_amount != null ? `${c.total_amount.toLocaleString()} MAD` : '—'}
                  </td>
                  <td className="px-2 py-3">
                    <Badge tone={resBadgeTone(c.status)}>{c.status === '—' ? '—' : t(`rstatus.${c.status}`)}</Badge>
                  </td>
                  <td className="px-2 py-3">
                    {c.has_pdf ? (
                      <FileCheck className="h-4 w-4 text-[var(--color-ok)]" />
                    ) : (
                      <span className="text-[var(--color-faint)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={pickOpen}
        onOpenChange={setPickOpen}
        title={t('con.pickTitle')}
        description={t('con.pickDesc')}
      >
        <ReservationPicker
          reservations={contractable}
          onPicked={(id) => navigate({ to: '/contracts/$contractId', params: { contractId: id } })}
        />
      </SlideOver>
    </div>
  )
}

function ReservationPicker({
  reservations,
  onPicked,
}: {
  reservations: ContractableReservation[]
  onPicked: (contractId: string) => void
}) {
  const { t } = useI18n()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (reservations.length === 0) {
    return (
      <EmptyState icon={CalendarClock} title={t('con.noContractable')} description={t('con.noContractableDesc')} />
    )
  }

  async function generate(r: ContractableReservation) {
    setBusyId(r.id)
    try {
      const result = await createContractFromReservation({ data: { reservation_id: r.id } })
      if (!result?.id) throw new Error(result?.error ?? 'Contract creation failed')
      toast.success(t('con.generatingContract'))
      onPicked(result.id)
    } catch (err: any) {
      toast.error(err?.message ?? t('con.couldNotGenerate'))
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-2.5">
      {reservations.map((r) => (
        <div
          key={r.id}
          className="skeu-card flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-2.5"
        >
          <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-muted)]">
            {r.image_url ? (
              <img src={r.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <Car className="h-5 w-5 text-[var(--color-faint)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-[var(--color-ink)]">{r.vehicle_plate ?? '—'}</span>
              <Badge tone={resBadgeTone(r.status)}>{t(`rstatus.${r.status}`)}</Badge>
            </div>
            <div className="truncate text-xs text-[var(--color-muted)]">
              {r.vehicle_brand ? `${r.vehicle_brand} · ` : ''}
              {r.client_name ?? t('fin.noClient')}
            </div>
            <div className="mt-0.5 text-xs tnum text-[var(--color-faint)]">
              {format(new Date(`${r.date_start}T00:00:00`), 'd MMM')} →{' '}
              {format(new Date(`${r.date_end}T00:00:00`), 'd MMM yyyy')}
              {r.total_amount != null ? ` · ${r.total_amount.toLocaleString()} MAD` : ''}
            </div>
          </div>
          <Button size="sm" loading={busyId === r.id} disabled={busyId !== null} onClick={() => generate(r)}>
            {t('con.generateThis')}
          </Button>
        </div>
      ))}
    </div>
  )
}
