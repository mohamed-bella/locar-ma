import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { getAuthState, createAgency } from '~/server/auth'
import { Button, Field, Input, Select } from '~/components/ui'
import { NumberField } from '~/components/ui/NumberField'
import { useI18n, type Locale } from '~/lib/i18n'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const auth = await getAuthState()
    if (!auth.user) throw redirect({ to: '/login' })
    if (auth.memberships.length > 0) throw redirect({ to: '/dashboard' })
  },
  component: Onboarding,
})

function Onboarding() {
  const router = useRouter()
  const { t, setLocale } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const fd = new FormData(e.currentTarget)
    const language = String(fd.get('language') ?? 'fr') as 'ar' | 'fr' | 'en'
    try {
      await createAgency({
        data: {
          agencyName: String(fd.get('agencyName') ?? ''),
          city: String(fd.get('city') ?? '') || undefined,
          language,
          fleetSize: fd.get('fleetSize') ? Number(fd.get('fleetSize')) : undefined,
          ownerName: String(fd.get('ownerName') ?? ''),
          phone: String(fd.get('phone') ?? '') || undefined,
        },
      })
      // Sync the UI language to the agency's chosen language (fr/en supported).
      if (language === 'fr' || language === 'en') setLocale(language as Locale)
      toast.success(t('onb.created'))
      await router.navigate({ to: '/dashboard' })
    } catch (err: any) {
      setError(err?.message ?? t('onb.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand)] font-black text-white">
            L
          </span>
          <span className="text-lg font-bold text-[var(--color-ink)]">Locar</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">{t('onb.title')}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t('onb.subtitleOp')}</p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-card)]"
        >
          <Field label={t('onb.agencyName')} required>
            <Input name="agencyName" required placeholder="Atlas Car" />
          </Field>
          <Field label={t('onb.fullName')} required>
            <Input name="ownerName" required placeholder="Youssef Alaoui" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('onb.city')}>
              <Input name="city" placeholder="Agadir" />
            </Field>
            <Field label={t('onb.phone')}>
              <Input name="phone" placeholder="+212 6 …" />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('onb.language')}>
              <Select name="language" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t('onb.fleetSize')} hint={t('onb.fleetHint')}>
              <NumberField name="fleetSize" decimalScale={0} placeholder="10" />
            </Field>
          </div>

          {error && <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            {t('onb.create')}
          </Button>
        </form>
      </div>
    </div>
  )
}
