import { useState } from 'react'
import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useRouter,
} from '@tanstack/react-router'
import * as Dialog from '@radix-ui/react-dialog'
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  FileText,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Building2,
} from 'lucide-react'
import { getAuthState, signOut } from '~/server/auth'
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from '~/lib/i18n'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const auth = await getAuthState()
    if (!auth.user) throw redirect({ to: '/login' })
    if (auth.memberships.length === 0) {
      // Platform admins have no agency membership — send them to the admin
      // console instead of onboarding. Regular users still onboard.
      if (auth.isPlatformAdmin) {
        if (!location.pathname.startsWith('/admin')) throw redirect({ to: '/admin' })
      } else {
        throw redirect({ to: '/onboarding' })
      }
    }
    return { auth, agency: auth.memberships[0] ?? null }
  },
  component: AppLayout,
})

const NAV = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/fleet', labelKey: 'nav.fleet', icon: Car },
  { to: '/reservations', labelKey: 'nav.reservations', icon: CalendarDays },
  { to: '/contracts', labelKey: 'nav.contracts', icon: FileText },
  { to: '/clients', labelKey: 'nav.clients', icon: Users },
  { to: '/finance', labelKey: 'nav.finance', icon: BarChart3 },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
] as const

function BrandMark({ logoUrl, name }: { logoUrl?: string | null; name?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
          <img src={logoUrl} alt={name ?? 'Logo'} className="h-full w-full object-contain p-0.5" />
        </span>
      ) : (
        <span className="skeu-primary flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black text-white">
          {(name?.trim()?.[0] ?? 'L').toUpperCase()}
        </span>
      )}
      <span className="skeu-emboss truncate text-[18px] font-black tracking-tight text-[var(--color-ink)]">
        {name?.trim() || 'Locar'}
      </span>
    </div>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { auth, agency } = Route.useRouteContext()

  // A platform admin with no agency membership gets an admin-only menu —
  // the agency pages (cars, reservations…) have no agency to load.
  if (!agency) {
    return (
      <nav className="flex flex-col gap-1.5">
        <div className="skeu-emboss px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-faint)]">
          {t('adm.nav')}
        </div>
        <Link
          to="/admin"
          onClick={onNavigate}
          className="nav-item group flex items-center gap-3 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] px-3 py-2.5 text-sm font-bold text-[var(--color-brand)] transition"
        >
          <Building2 className="h-[18px] w-[18px]" />
          {t('adm.agencies')}
        </Link>
      </nav>
    )
  }

  return (
    <nav className="flex flex-col gap-1.5">
      <div className="skeu-emboss px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-faint)]">
        {t('nav.menu')}
      </div>
      {NAV.map(({ to, labelKey, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition"
        >
          <Icon className="h-[18px] w-[18px]" />
          {t(labelKey)}
        </Link>
      ))}
      {auth.isPlatformAdmin && (
        <Link
          to="/admin"
          onClick={onNavigate}
          className="nav-item group mt-1 flex items-center gap-3 rounded-lg border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] px-3 py-2.5 text-sm font-bold text-[var(--color-brand)] transition"
        >
          <ShieldCheck className="h-[18px] w-[18px]" />
          {t('adm.nav')}
        </Link>
      )}
    </nav>
  )
}

function Paywall({
  agencyName,
  role,
  onSignOut,
}: {
  agencyName: string
  role: string
  onSignOut: () => void
}) {
  const { t } = useI18n()
  const isOwner = role === 'owner'
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-canvas)] px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-[var(--shadow-pop)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <Lock className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="mt-5 text-xl font-black tracking-tight text-[var(--color-ink)]">
          {t('billing.lockedTitle')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          {isOwner ? t('billing.lockedOwnerBody') : t('billing.lockedStaffBody')}
        </p>

        {isOwner && (
          <a
            href="mailto:support@locar.ma"
            className="skeu-primary mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold text-white"
          >
            {t('billing.contactSupport')}
          </a>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-[var(--color-line)] pt-4">
          <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{agencyName}</span>
          <button
            onClick={onSignOut}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            <LogOut className="h-4 w-4" /> {t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}

function BillingBanner({
  agency,
}: {
  agency: { is_active: boolean; subscription_status: string } | null
}) {
  const { t } = useI18n()
  if (!agency) return null

  const suspended = agency.is_active === false || agency.subscription_status === 'suspended'
  const pastDue = agency.subscription_status === 'past_due'
  if (!suspended && !pastDue) return null

  const title = suspended ? t('billing.suspendedTitle') : t('billing.pastDueTitle')
  const body = suspended ? t('billing.suspendedBody') : t('billing.pastDueBody')

  return (
    <div
      role="alert"
      className={`mb-6 flex items-start gap-3 rounded-xl border p-4 sm:p-5 ${
        suspended
          ? 'border-red-300 bg-red-600 text-white shadow-[var(--shadow-card)]'
          : 'border-red-300 bg-red-50 text-red-800'
      }`}
    >
      <AlertTriangle className={`mt-0.5 h-6 w-6 shrink-0 ${suspended ? 'text-white' : 'text-red-600'}`} />
      <div className="min-w-0">
        <div className="text-base font-black tracking-tight sm:text-lg">{title}</div>
        <p className={`mt-1 text-sm ${suspended ? 'text-red-50' : 'text-red-700'}`}>{body}</p>
      </div>
    </div>
  )
}

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div className="mt-3">
      <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)]">
        {t('nav.language')}
      </div>
      <div className="flex gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-1">
        {LOCALES.map((l: Locale) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
              locale === l
                ? 'bg-white text-[var(--color-brand)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>
    </div>
  )
}

function AppLayout() {
  const { agency } = Route.useRouteContext()
  const router = useRouter()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)

  async function onSignOut() {
    await signOut()
    await router.navigate({ to: '/login' })
  }

  // Hard billing lock: a suspended / deactivated agency is read-only at the DB
  // layer (RLS) and fully blocked in the UI here. Owners get a pay CTA; staff
  // are told to contact the owner. past_due is only warned (BillingBanner).
  const ag = agency?.agency
  if (ag && (ag.is_active === false || ag.subscription_status === 'suspended')) {
    return <Paywall agencyName={ag.name} role={agency!.role} onSignOut={onSignOut} />
  }

  const agencyBlock = (
    <div>
      <LanguageSwitcher />
      <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-3">
        <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
          {agency?.agency?.name ?? t('nav.yourAgency')}
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-xs capitalize text-[var(--color-muted)]">
            {agency?.role ?? t('adm.nav')}
          </span>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            <LogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      {/* Desktop sidebar */}
      <aside className="skeu-rail fixed inset-y-0 left-0 hidden w-64 flex-col p-4 lg:flex">
        <div className="px-2 py-2">
          <BrandMark logoUrl={agency?.agency?.logo_url} name={agency?.agency?.name} />
        </div>
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        {agencyBlock}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
        <BrandMark logoUrl={agency?.agency?.logo_url} name={agency?.agency?.name} />
        <button
          onClick={() => setMenuOpen(true)}
          className="rounded-lg p-2 text-[var(--color-ink-soft)] hover:bg-black/5"
          aria-label={t('nav.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile sheet nav */}
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-40 bg-black/35 lg:hidden" />
          <Dialog.Content className="anim-sheet fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col bg-white p-4 lg:hidden">
            <div className="flex items-center justify-between px-2 py-2">
              <BrandMark logoUrl={agency?.agency?.logo_url} name={agency?.agency?.name} />
              <Dialog.Close className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-black/5">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="mt-6 flex-1">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </div>
            {agencyBlock}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Main */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <BillingBanner agency={agency?.agency ?? null} />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
