import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Car,
  CalendarPlus,
  FileText,
  Users,
  Droplet,
  ShieldCheck,
  Receipt,
  ClipboardCheck,
  Wallet,
  Settings,
  ChevronRight,
  CalendarClock,
  CalendarCheck,
  CheckCircle2,
  Wrench,
} from 'lucide-react'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { getDashboardStats } from '~/server/dashboard'
import { getFleetMaintenance } from '~/server/maintenance'
import { findTracker, trackRows } from '~/lib/tracking'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { PageHeader, StatCard, Card, CardHeader, CardBody } from '~/components/ui'

export const Route = createFileRoute('/_app/dashboard')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes, stats, maintenance] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
      getDashboardStats(),
      getFleetMaintenance(),
    ])
    return { vehicles, alertRules, documentTypes, stats, maintenance }
  },
  component: Dashboard,
})

const mad = (n: number) => `${n.toLocaleString()} MAD`

function Dashboard() {
  const { auth, agency } = Route.useRouteContext()
  const { vehicles, alertRules, documentTypes, stats, maintenance } = Route.useLoaderData()
  const { t } = useI18n()
  useRealtimeInvalidate('vehicles')
  useRealtimeInvalidate('reservations')
  useRealtimeInvalidate('service_records')

  const count = (s: string) => vehicles.filter((v) => v.status === s).length
  const available = count('available')

  // Legal-paper counts via the shared tracking engine.
  const rows = (code: string) => trackRows(vehicles, findTracker(code, documentTypes)!, alertRules)
  const insWeek = rows('insurance').filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length
  const visDue = rows('visite').filter((r) => r.status === 'expired' || r.status === 'soon').length
  // Mechanical service counts from the dual-axis maintenance engine.
  const dueRows = maintenance.rows.filter((r) => r.status === 'expired' || r.status === 'soon')
  const vidDue = dueRows.filter((r) => r.type === 'vidange').length
  const serviceDue = dueRows.length

  const firstName = agency.full_name?.split(' ')[0] ?? auth.user?.email?.split('@')[0]

  const deadlines: DeadlineDef[] = [
    { icon: ShieldCheck, tone: 'red', count: insWeek, label: t('dash.dlInsurance'), to: '/tracking/$type', params: { type: 'insurance' } },
    { icon: ClipboardCheck, tone: 'amber', count: visDue, label: t('dash.dlVisite'), to: '/tracking/$type', params: { type: 'visite' } },
    { icon: Droplet, tone: 'amber', count: vidDue, label: t('dash.dlVidange'), to: '/tracking/$type', params: { type: 'vidange' } },
    { icon: Wrench, tone: 'amber', count: serviceDue, label: t('svc.dueThisWeek'), to: '/tracking' },
    { icon: CalendarCheck, tone: 'blue', count: stats.returnsToday, label: t('dash.dlReturns'), to: '/reservations' },
    { icon: CalendarClock, tone: 'blue', count: stats.pickupsToday, label: t('dash.dlPickups'), to: '/reservations' },
    { icon: CheckCircle2, tone: 'green', count: available, label: t('dash.dlAvailable'), to: '/fleet' },
  ]

  const tiles: TileDef[] = [
    { to: '/fleet', icon: Car, label: t('dash.tileCars'), c: 'blue' },
    { to: '/reservations', icon: CalendarPlus, label: t('dash.tileReservations'), c: 'brand' },
    { to: '/contracts', icon: FileText, label: t('dash.tileContracts'), c: 'indigo' },
    { to: '/clients', icon: Users, label: t('dash.tileClients'), c: 'emerald' },
    { to: '/tracking/$type', params: { type: 'vidange' }, icon: Droplet, label: t('dash.tileVidange'), c: 'amber' },
    { to: '/tracking/$type', params: { type: 'insurance' }, icon: ShieldCheck, label: t('dash.tileAssurance'), c: 'sky' },
    { to: '/tracking/$type', params: { type: 'visite' }, icon: ClipboardCheck, label: t('dash.tileVisite'), c: 'emerald' },
    { to: '/tracking', icon: Receipt, label: t('dash.tileTracking'), c: 'rose' },
    { to: '/finance', icon: Wallet, label: t('dash.tileFinance'), c: 'violet' },
    { to: '/settings', icon: Settings, label: t('dash.tileSettings'), c: 'slate' },
  ]

  return (
    <div>
      <PageHeader
        title={firstName ? t('dash.welcomeName', { name: firstName }) : t('dash.welcome')}
        subtitle={t('dash.glance')}
      />

      {/* Stats strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t('status.available')} value={available} icon={CheckCircle2} tone="ok" />
        <StatCard label={t('status.rented')} value={count('rented')} icon={Car} tone="info" />
        <StatCard label={t('status.maintenance')} value={count('maintenance')} icon={Settings} tone="warn" />
        <StatCard label={t('dash.revMonth')} value={mad(stats.revMonth)} icon={Wallet} tone="brand" />
      </div>

      {/* Centre des échéances */}
      <Card className="mt-5">
        <CardHeader title={t('dash.deadlines')} subtitle={t('dash.deadlinesSub')} />
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--color-line)]">
            {deadlines.map((d, i) => (
              <DeadlineRow key={i} {...d} />
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Quick access tiles */}
      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wider text-[var(--color-faint)]">
        {t('dash.quickAccess')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {tiles.map((tile, i) => (
          <Tile key={i} {...tile} />
        ))}
      </div>
    </div>
  )
}

// ── Deadline row ──
type Tone = 'red' | 'amber' | 'blue' | 'green'
type DeadlineDef = {
  icon: React.ComponentType<{ className?: string }>
  tone: Tone
  count: number
  label: string
  to: string
  params?: Record<string, string>
}
const DL_TONE: Record<Tone, { chip: string; num: string }> = {
  red: { chip: 'bg-red-50 text-red-600', num: 'text-red-600' },
  amber: { chip: 'bg-amber-50 text-amber-600', num: 'text-amber-600' },
  blue: { chip: 'bg-blue-50 text-blue-600', num: 'text-blue-600' },
  green: { chip: 'bg-emerald-50 text-emerald-600', num: 'text-emerald-600' },
}

function DeadlineRow({ icon: Icon, tone, count, label, to, params }: DeadlineDef) {
  const c = DL_TONE[tone]
  const active = count > 0
  return (
    <li>
      <Link
        to={to as any}
        params={params as any}
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-muted)] sm:px-5"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? c.chip : 'bg-[var(--color-surface-muted)] text-[var(--color-faint)]'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="flex-1 text-sm font-semibold text-[var(--color-ink)]">{label}</span>
        <span className={`text-2xl font-black tnum ${active ? c.num : 'text-[var(--color-faint)]'}`}>{count}</span>
        <ChevronRight className="h-4 w-4 text-[var(--color-faint)]" />
      </Link>
    </li>
  )
}

// ── Quick tile ──
type TileDef = {
  to: string
  params?: Record<string, string>
  icon: React.ComponentType<{ className?: string }>
  label: string
  c: string
}
const TONES: Record<string, { bg: string; chip: string }> = {
  blue: { bg: 'bg-blue-50', chip: 'bg-blue-600' },
  brand: { bg: 'bg-[var(--color-brand-soft)]', chip: 'bg-[var(--color-brand)]' },
  indigo: { bg: 'bg-indigo-50', chip: 'bg-indigo-600' },
  emerald: { bg: 'bg-emerald-50', chip: 'bg-emerald-600' },
  amber: { bg: 'bg-amber-50', chip: 'bg-amber-500' },
  sky: { bg: 'bg-sky-50', chip: 'bg-sky-600' },
  violet: { bg: 'bg-violet-50', chip: 'bg-violet-600' },
  rose: { bg: 'bg-rose-50', chip: 'bg-rose-600' },
  slate: { bg: 'bg-slate-100', chip: 'bg-slate-600' },
}

function Tile({ to, params, icon: Icon, label, c }: TileDef) {
  const tone = TONES[c] ?? TONES.slate
  return (
    <Link
      to={to as any}
      params={params as any}
      className={`group flex items-center gap-3 rounded-2xl border border-[var(--color-line)] ${tone.bg} p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-ring)]`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.chip} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(16,24,40,0.2)]`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-bold text-[var(--color-ink)]">{label}</span>
    </Link>
  )
}
