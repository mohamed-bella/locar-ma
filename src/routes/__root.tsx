import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Toaster } from 'sonner'
import appCss from '~/styles/app.css?url'
import { TopProgressBar } from '~/components/TopProgressBar'
import { getLocale } from '~/server/locale'
import { I18nProvider, isRtl, type Locale } from '~/lib/i18n'
import { clientEnv } from '~/lib/env'

// Origin of the Supabase project — every page hits it for data, auth and the
// realtime socket. Warming the DNS/TLS handshake here shaves the first request.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(clientEnv.SUPABASE_URL).origin
  } catch {
    return null
  }
})()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#1d5b8d' },
      // PWA / installable
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'Rentiq' },
      { title: 'Rentiq — Car rental management' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/rentiq-logo.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/rentiq-logo.png' },
    ],
  }),
  loader: async () => ({ locale: await getLocale() }),
  component: RootComponent,
})

function RootComponent() {
  const { locale } = Route.useLoaderData()
  return (
    <RootDocument locale={locale}>
      <I18nProvider initialLocale={locale}>
        <Outlet />
      </I18nProvider>
    </RootDocument>
  )
}

function RootDocument({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <head>
        {SUPABASE_ORIGIN && (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        )}
        <HeadContent />
      </head>
      <body>
        <TopProgressBar />
        {children}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ style: { borderRadius: '12px' } }}
        />
        <Scripts />
      </body>
    </html>
  )
}
