import { useEffect, useState } from 'react'
import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { Lock, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { getSupabaseBrowserClient } from '~/lib/supabase'
import { Button, Field, Input } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

// Landing page for the password-recovery email link. The link (sent by
// resetPasswordForEmail from the browser client) carries either a PKCE `code`
// or a `token_hash` — we establish a session from it here, then let the user
// pick a new password via updateUser().
export const Route = createFileRoute('/reset-password')({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === 'string' ? s.code : undefined,
    token_hash: typeof s.token_hash === 'string' ? s.token_hash : undefined,
    type: typeof s.type === 'string' ? s.type : undefined,
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const router = useRouter()
  const search = Route.useSearch()
  const { t } = useI18n()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseBrowserClient()
      try {
        // If the ssr client already consumed the URL, a session exists.
        const { data: existing } = await supabase.auth.getSession()
        if (!existing.session) {
          if (search.code) {
            const { error } = await supabase.auth.exchangeCodeForSession(search.code)
            if (error) throw error
          } else if (search.token_hash) {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: search.token_hash,
              type: 'recovery',
            })
            if (error) throw error
          } else {
            throw new Error('no recovery token')
          }
        }
        setReady(true)
      } catch {
        setInvalid(true)
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success(t('auth.passwordUpdated'))
      await router.navigate({ to: '/dashboard' })
    } catch (err: any) {
      toast.error(err?.message ?? t('auth.signInFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> {t('auth.backToSignIn')}
        </Link>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          {t('auth.setNewPassword')}
        </h1>

        {invalid ? (
          <p className="mt-4 text-sm font-medium text-[var(--color-danger)]">{t('auth.resetLinkInvalid')}</p>
        ) : (
          <form onSubmit={onSubmit} className="skeu-card mt-8 space-y-4 rounded-2xl border p-6">
            <Field label={t('auth.newPassword')}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  disabled={!ready}
                />
              </div>
            </Field>
            <Button type="submit" size="lg" loading={busy} disabled={!ready} className="w-full">
              {t('auth.updatePassword')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
