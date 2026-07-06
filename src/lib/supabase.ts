import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from './env'
import type { Database } from './database.types'

// Browser Supabase client. Reads session from cookies set by the server.
// Persist the auth cookies for a year (default is a session cookie that dies on
// browser/PWA close, forcing a re-login every time) so users stay signed in.
export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.SUPABASE_URL,
    clientEnv.SUPABASE_ANON_KEY,
    {
      cookieOptions: { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 },
    },
  )
}
