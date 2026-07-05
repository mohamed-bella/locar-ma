import { createFileRoute, Link } from '@tanstack/react-router'
import { ShieldCheck, Receipt, ClipboardCheck, Droplet, FileText } from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { allTrackers, dueCount, type Tracker } from '~/lib/tracking'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { PageHeader } from '~/components/ui'

export const Route = createFileRoute('/_app/tracking/')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
    ])
    return { vehicles, alertRules, documentTypes }
  },
  component: TrackingHub,
})

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  insurance: ShieldCheck,
  vignette: Receipt,
  visite: ClipboardCheck,
  vidange: Droplet,
}
const TONES: Record<string, { bg: string; chip: string }> = {
  insurance: { bg: 'bg-sky-50', chip: 'bg-sky-600' },
  vignette: { bg: 'bg-indigo-50', chip: 'bg-indigo-600' },
  visite: { bg: 'bg-emerald-50', chip: 'bg-emerald-600' },
  vidange: { bg: 'bg-amber-50', chip: 'bg-amber-500' },
}
const CUSTOM_TONE = { bg: 'bg-slate-100', chip: 'bg-slate-600' }

function TrackingHub() {
  const { vehicles, alertRules, documentTypes } = Route.useLoaderData()
  const { t } = useI18n()
  useRealtimeInvalidate('vehicles')
  useRealtimeInvalidate('document_types')

  const trackers = allTrackers(documentTypes)

  return (
    <div>
      <PageHeader title={t('trk.title')} subtitle={t('trk.subtitle')} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {trackers.map((tr) => (
          <TrackerCard key={tr.code} tracker={tr} due={dueCount(vehicles, tr, alertRules)} />
        ))}
      </div>
    </div>
  )
}

function TrackerCard({ tracker: tr, due }: { tracker: Tracker; due: number }) {
  const { t } = useI18n()
  const Icon = ICONS[tr.code] ?? FileText
  const tone = TONES[tr.code] ?? CUSTOM_TONE
  const name = tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code)

  return (
    <Link
      to="/tracking/$type"
      params={{ type: tr.code }}
      className={`group flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] ${tone.bg} p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-ring)]`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.chip} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(16,24,40,0.2)]`}>
          <Icon className="h-6 w-6" />
        </span>
        {due > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-xs font-bold text-white">
            {due}
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-bold text-[var(--color-ink)] sm:text-base">{name}</div>
        <div className="mt-0.5 text-xs font-medium text-[var(--color-muted)]">
          {due > 0 ? t('dash.nDue', { n: due }) : t('dash.upToDate')}
        </div>
      </div>
    </Link>
  )
}
