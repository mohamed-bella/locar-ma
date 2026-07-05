// Supabase-generated types placeholder.
// Regenerate against your project once migrations are applied:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
// Until then this keeps the typed clients compiling.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>
      Insert: Record<string, unknown>
      Update: Record<string, unknown>
      Relationships: []
    }>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
