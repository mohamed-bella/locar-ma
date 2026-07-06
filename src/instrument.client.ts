// Sentry browser init. Imported at the top of src/router.tsx (which loads on
// both server and client) — the window guard ensures init runs only in the
// browser, never on the server, and never twice.
import * as Sentry from '@sentry/tanstackstart-react'

if (typeof window !== 'undefined') {
  Sentry.init({
    dsn:
      import.meta.env.VITE_SENTRY_DSN ||
      'https://891cfee11a6ca7edc1859fc5a967a066@o4511689711222784.ingest.de.sentry.io/4511689715220560',
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
