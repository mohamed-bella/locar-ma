import { createServerFn } from '@tanstack/react-start'
import { getCookies } from '@tanstack/react-start/server'
import type { Locale } from '~/lib/i18n'

const LOCALES = ['fr', 'en'] as const
const DEFAULT_LOCALE: Locale = 'fr'

// Read the persisted UI language from the request cookie so SSR renders in the
// right language (no hydration flash). Client writes the cookie on switch.
export const getLocale = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Locale> => {
    const cookies = getCookies() ?? {}
    const raw = cookies['locale']
    return (LOCALES as readonly string[]).includes(raw ?? '')
      ? (raw as Locale)
      : DEFAULT_LOCALE
  },
)
