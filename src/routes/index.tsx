import { createFileRoute, Link } from '@tanstack/react-router'
import { Car, CalendarCheck, FileText, ArrowRight } from 'lucide-react'
import { Button } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { t } = useI18n()
  const FEATURES = [
    { icon: Car, title: t('nav.fleet'), desc: t('landing.featFleet') },
    { icon: CalendarCheck, title: t('nav.reservations'), desc: t('landing.featRes') },
    { icon: FileText, title: t('nav.contracts'), desc: t('landing.featContracts') },
  ]
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)] font-black text-white">
            L
          </span>
          <span className="text-lg font-bold text-[var(--color-ink)]">Locar</span>
        </div>
        <Link to="/login">
          <Button variant="secondary">{t('auth.signIn')}</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 sm:py-24">
          <span className="inline-flex items-center rounded-full border border-[var(--color-line-strong)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)]">
            {t('landing.badge')}
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-6xl">
            {t('landing.headA')} <span className="text-[var(--color-brand)]">{t('landing.paperless')}</span> {t('landing.headB')}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[var(--color-muted)]">
            {t('landing.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login">
              <Button size="lg">
                {t('landing.getStarted')} <ArrowRight className="h-[18px] w-[18px]" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="skeu-card rounded-[var(--radius-card)] border p-6"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-[var(--color-ink)]">{title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
