import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { getSupabaseBrowserClient } from '~/lib/supabase'
import { useI18n } from '~/lib/i18n'

// Deliberately 2012-era: skeuomorphic panel, glossy gradient button, recessed
// inputs, a blue (#1d5b8d) header bar. Raw inputs/buttons (not the app's flat UI
// kit) so the retro look is authentic. Shared by `/` and `/login`.
const BLUE = '#1d5b8d'

const inputStyle: React.CSSProperties = {
  border: '1px solid #b8b8b8',
  borderRadius: 4,
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)',
  background: '#fff',
}

export function LoginForm() {
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

  const label = 'mb-1 block text-[13px] font-bold text-[#444] [text-shadow:0_1px_0_#fff]'
  const inputCls =
    'w-full px-3 py-2.5 text-[15px] text-[#333] outline-none transition focus:border-[#1d5b8d] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),0_0_0_3px_rgba(29,91,141,0.25)]'

  return (
    <div
      className="flex min-h-dvh items-start justify-center px-4 py-14"
      style={{ background: 'linear-gradient(#eaeaea, #cfcfcf)' }}
    >
      <div className="w-full max-w-[380px]">
        {/* Glossy logo badge */}
        <div className="mb-5 flex flex-col items-center gap-2">
          <span
            className="flex h-16 w-16 items-center justify-center text-3xl font-black text-white"
            style={{
              borderRadius: 12,
              background: `linear-gradient(#2f7bb5, ${BLUE})`,
              border: '1px solid #164a73',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.3)',
              textShadow: '0 -1px 0 rgba(0,0,0,0.35)',
            }}
          >
            R
          </span>
          <span className="text-[15px] font-bold text-[#555] [text-shadow:0_1px_0_#fff]">Rentiq</span>
        </div>

        {/* Skeuomorphic panel */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #bfbfbf',
            background: '#fff',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {/* Blue header bar */}
          <div
            className="px-6 py-3.5 text-[16px] font-bold text-white"
            style={{
              borderRadius: '6px 6px 0 0',
              background: `linear-gradient(${'#2a72ab'}, ${BLUE})`,
              borderBottom: '1px solid #164a73',
              textShadow: '0 -1px 0 rgba(0,0,0,0.3)',
            }}
          >
            {mode === 'reset' ? t('auth.resetTitle') : t('auth.signIn')}
          </div>

          <div className="p-6">
            {sent ? (
              <div
                className="p-5 text-center text-sm text-[#555]"
                style={{ border: '1px solid #d9d9d9', borderRadius: 4, background: '#f7f7f7' }}
              >
                <p className="font-bold text-[#333]">{t('auth.checkEmail')}</p>
                <p className="mt-1">{t(mode === 'reset' ? 'auth.resetSentTo' : 'auth.linkSentTo', { email })}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className={label}>{t('auth.email')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@agency.ma"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                {mode === 'password' && (
                  <div>
                    <label className={label}>{t('auth.password')}</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset')
                        setError(null)
                      }}
                      className="mt-1.5 text-[12px] font-medium hover:underline"
                      style={{ color: BLUE }}
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                )}

                {error && (
                  <p
                    className="px-3 py-2 text-[13px] font-medium text-[#8a1f1f]"
                    style={{ border: '1px solid #e0b4b4', borderRadius: 4, background: '#fbeaea' }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 text-[15px] font-bold text-white transition active:translate-y-px disabled:opacity-60"
                  style={{
                    borderRadius: 4,
                    background: `linear-gradient(#2f7bb5, ${BLUE})`,
                    border: '1px solid #164a73',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.2)',
                    textShadow: '0 -1px 0 rgba(0,0,0,0.3)',
                  }}
                >
                  {busy
                    ? t('common.loading')
                    : mode === 'password'
                      ? t('auth.signIn')
                      : mode === 'magic'
                        ? t('auth.sendMagic')
                        : t('auth.sendReset')}
                </button>

                <div className="text-center">
                  {mode === 'reset' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('password')
                        setError(null)
                      }}
                      className="text-[13px] font-medium hover:underline"
                      style={{ color: BLUE }}
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
                      className="text-[13px] font-medium hover:underline"
                      style={{ color: BLUE }}
                    >
                      {mode === 'password' ? t('auth.useMagic') : t('auth.usePassword')}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-[#888] [text-shadow:0_1px_0_#fff]">
          © {new Date().getFullYear()} Rentiq
        </p>
      </div>
    </div>
  )
}
