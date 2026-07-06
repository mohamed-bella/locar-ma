// Sentry browser init. Imported at the top of src/router.tsx (which loads on
// both server and client) — the window guard ensures init runs only in the
// browser, never on the server, and never twice.
import * as Sentry from '@sentry/tanstackstart-react'

if (typeof window !== 'undefined') {
  Sentry.init({
    dsn:
      import.meta.env.VITE_SENTRY_DSN ||
      'https://c2c959f3361b55d9f6a1cc37084ff801@o4511689711222784.ingest.de.sentry.io/4511689729769552',
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
