import { createBrowserClient } from '@supabase/ssr'
import { clientEnv } from './env'
import type { Database } from './database.types'

// Browser Supabase client. Reads session from cookies set by the server.
export function getSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    clientEnv.SUPABASE_URL,
    clientEnv.SUPABASE_ANON_KEY,
  )
}
