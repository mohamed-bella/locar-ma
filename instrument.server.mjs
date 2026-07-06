// Sentry server init. Imported FIRST in the server entries (api/server.mjs and
// server.mjs) so it initializes before the app handler runs. DSN is public by
// design; override via SENTRY_DSN env if needed.
import * as Sentry from '@sentry/tanstackstart-react'

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    'https://c2c959f3361b55d9f6a1cc37084ff801@o4511689711222784.ingest.de.sentry.io/4511689729769552',
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  // Light tracing; bump if you want more perf data.
  tracesSampleRate: 0.1,
})
