// Client-safe env. Only VITE_-prefixed vars are inlined into the browser bundle.
export const clientEnv = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
}
