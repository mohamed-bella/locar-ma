import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Users, Plus, Search, ShieldAlert } from 'lucide-react'
import { listClients } from '~/server/clients'
import { AddClientDialog } from '~/components/AddClientDialog'
import { clientStatusTone } from '~/lib/clients'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { Button, Badge, Input, EmptyState, PageHeader, TableSkeleton } from '~/components/ui'

export const Route = createFileRoute('/_app/clients/')({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } =>
    s.new === true || s.new === 'true' ? { new: true } : {},
  loader: async () => ({ clients: await listClients() }),
  component: Clients,
  pendingComponent: ClientsPending,
})

function ClientsPending() {
  const { t } = useI18n()
  return (
    <div>
      <PageHeader title={t('cli.title')} subtitle={t('common.loading')} />
      <div className="mt-6">
        <TableSkeleton rows={6} />
      </div>
    </div>
  )
}

function Clients() {
  const { clients } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useI18n()
  const { new: wantNew } = Route.useSearch()
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  useRealtimeInvalidate('clients')

  // Deep-link: /clients?new=true opens the add dialog (dashboard CTA).
  useEffect(() => {
    if (wantNew) {
      setAddOpen(true)
      navigate({ to: '/clients', search: {}, replace: true })
    }
  }, [wantNew, navigate])

  const flagged = clients.filter((c) => c.status !== 'active').length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.full_name, c.cin_passport, c.phone].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [clients, query])

  return (
    <div>
      <PageHeader
        title={t('cli.title')}
        subtitle={
          <span className="flex items-center gap-2">
            {clients.length === 1 ? t('cli.client', { n: clients.length }) : t('cli.clients', { n: clients.length })}
            {flagged > 0 && (
              <Badge tone="danger" dot>
                {t('cli.flaggedCount', { n: flagged })}
              </Badge>
            )}
          </span>
        }
        actions={
          <Button size="lg" onClick={() => setAddOpen(true)}>
            <Plus className="h-[18px] w-[18px]" /> {t('cli.add')}
          </Button>
        }
      />

      {clients.length > 0 && (
        <div className="relative mt-6 max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cli.searchPlaceholder')}
            className="pl-10"
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('cli.empty')}
            description={t('cli.emptyDescBook')}
            action={
              <Button size="lg" onClick={() => setAddOpen(true)}>
                <Plus className="h-[18px] w-[18px]" /> {t('cli.add')}
              </Button>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-xs uppercase tracking-wide text-[var(--color-faint)]">
                <th className="px-4 py-3 font-medium">{t('common.client')}</th>
                <th className="hidden px-2 py-3 font-medium sm:table-cell">{t('cli.cin')}</th>
                <th className="hidden px-2 py-3 font-medium sm:table-cell">{t('cli.phone')}</th>
                <th className="px-2 py-3 font-medium">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate({ to: '/clients/$clientId', params: { clientId: c.id } })}
                  className="cursor-pointer border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-surface-muted)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-sm font-semibold text-[var(--color-muted)]">
                        {c.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-semibold text-[var(--color-ink)]">{c.full_name}</span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-3 text-[var(--color-ink-soft)] sm:table-cell">
                    {c.cin_passport ?? '—'}
                  </td>
                  <td className="hidden px-2 py-3 text-[var(--color-ink-soft)] sm:table-cell">{c.phone ?? '—'}</td>
                  <td className="px-2 py-3">
                    <Badge tone={clientStatusTone(c.status)} dot>
                      {c.status === 'blacklisted' && <ShieldAlert className="h-3 w-3" />}
                      {t(`cstatus.${c.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[var(--color-muted)]">
                    {t('cli.noMatch', { q: query })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => router.invalidate()} />
    </div>
  )
}
