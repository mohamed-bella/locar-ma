import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import { serverEnv } from './env.server'
import type { Database } from './database.types'

// Request-scoped Supabase client. Reads/writes the auth session via cookies so
// SSR and server functions act as the logged-in user (RLS enforced).
export function getSupabaseServerClient() {
  const env = serverEnv()

  return createServerClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_ANON_KEY,
    {
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
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
