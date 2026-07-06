import { useState } from 'react'
import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { Mail, Lock, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getSupabaseBrowserClient } from '~/lib/supabase'
import { Button, Field, Input } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

export const Route = createFileRoute('/login')({
  component: Login,
})

function Login() {
  const router = useRouter()
  const { t } = useI18n()
  const [mode, setMode] = useState<'password' | 'magic' | 'reset'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const supabase = getSupabaseBrowserClient()
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success(t('auth.signedIn'))
        await router.navigate({ to: '/dashboard' })
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        })
        if (error) throw error
        setSent(true)
      } else {
        // reset: email a recovery link that lands on /reset-password.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setSent(true)
      }
    } catch (err: any) {
      setError(err?.message ?? t('auth.signInFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-ink)] p-10 text-white lg:flex">
        <div
          className="absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, #fa5a28, transparent 70%)' }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand)] font-black">
            L
          </span>
          <span className="text-lg font-bold">Locar</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            {t('auth.panelHeadline')}
          </h2>
          <p className="mt-3 max-w-sm text-white/70">
            {t('auth.panelSub')}
          </p>
        </div>
        <p className="relative text-sm text-white/50">© {new Date().getFullYear()} Locar.ma</p>
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> {t('auth.home')}
          </Link>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            {mode === 'reset' ? t('auth.resetTitle') : t('auth.signIn')}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {mode === 'reset' ? t('auth.resetIntro') : t('auth.welcomeBack')}
          </p>

          {sent ? (
            <div className="skeu-card mt-8 rounded-2xl border p-6 text-center">
              <Mail className="mx-auto h-8 w-8 text-[var(--color-brand)]" />
              <p className="mt-3 font-semibold text-[var(--color-ink)]">{t('auth.checkEmail')}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {t(mode === 'reset' ? 'auth.resetSentTo' : 'auth.linkSentTo', { email })}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Field label={t('auth.email')}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@agency.ma"
                    className="pl-10"
                  />
                </div>
              </Field>

              {mode === 'password' && (
                <Field label={t('auth.password')}>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset')
                      setError(null)
                    }}
                    className="mt-1.5 block text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-brand)]"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </Field>
              )}

              {error && <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>}

              <Button type="submit" size="lg" loading={busy} className="w-full">
                {mode === 'password' ? t('auth.signIn') : mode === 'magic' ? t('auth.sendMagic') : t('auth.sendReset')}
              </Button>

              {mode === 'reset' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode('password')
                    setError(null)
                  }}
                  className="w-full text-center text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-brand)]"
                >
                  {t('auth.backToSignIn')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode((m) => (m === 'password' ? 'magic' : 'password'))
                    setError(null)
                  }}
                  className="w-full text-center text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-brand)]"
                >
                  {mode === 'password' ? t('auth.useMagic') : t('auth.usePassword')}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
