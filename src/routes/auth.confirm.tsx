import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { exchangeAuthCode } from '~/server/auth'

export const Route = createFileRoute('/auth/confirm')({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === 'string' ? s.code : undefined,
    token_hash: typeof s.token_hash === 'string' ? s.token_hash : undefined,
    type: typeof s.type === 'string' ? s.type : undefined,
  }),
  component: Confirm,
})

function Confirm() {
  const router = useRouter()
  const search = Route.useSearch()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        // Server-side exchange: reads the PKCE verifier cookie + sets the
        // session cookies on the response.
        await exchangeAuthCode({ data: search })
        await router.invalidate()
        await router.navigate({ to: '/dashboard' })
      } catch (err: any) {
        setError(err?.message ?? 'Confirmation failed')
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm text-neutral-500">Signing you in…</p>
      )}
    </main>
  )
}
