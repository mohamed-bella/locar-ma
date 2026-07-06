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
import { I18nProvider, type Locale } from '~/lib/i18n'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#dddddd' },
      { title: 'Locar.ma — Car rental management' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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
    <html lang={locale} dir="ltr">
      <head>
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
