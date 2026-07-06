import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import { serverEnv } from './env.server'
import type { Database } from './database.types'

// A single hung request to Supabase would otherwise ride the serverless 30s
// wall and 504. Cap every PostgREST/Auth call so a stall surfaces as a fast,
// named error in the logs instead. Respects any caller-provided AbortSignal.
function timeoutFetch(input: any, init?: any): Promise<Response> {
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
}

// Request-scoped Supabase client. Reads/writes the auth session via cookies so
// SSR and server functions act as the logged-in user (RLS enforced).
export function getSupabaseServerClient() {
  const env = serverEnv()

  return createServerClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
      global: { fetch: timeoutFetch },
      // Persist auth cookies for a year so a refreshed session written by the
      // server stays across browser/PWA restarts (matches the browser client).
      cookieOptions: { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 },
      cookies: {
        getAll() {
          const all = getCookies() ?? {}
          return Object.entries(all).map(([name, value]) => ({
            name,
            value: value ?? '',
          }))
        },
        setAll(cookies) {
          for (const { name, value, options } of cookies) {
            setCookie(name, value, options as any)
          }
        },
      },
    },
  )
}

// Service-role client. Bypasses RLS — use ONLY in trusted server code for
// operations that legitimately need to cross tenant boundaries. Never expose.
export function getSupabaseAdminClient() {
  const env = serverEnv()
  return createClient<Database>(
    env.VITE_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: timeoutFetch },
    },
  )
}
