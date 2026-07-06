import { z } from 'zod'

// Server-only env. NEVER import this from client code.
// Validated once at first access so a misconfigured deploy fails loud.
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
  // Private bucket for sensitive files (contract PDFs with client PII, ID
  // scans). Served only via short-lived presigned URLs — never public.
  // Falls back to R2_BUCKET if unset, but in production this MUST point to a
  // bucket with NO public access.
  R2_DOCS_BUCKET: z.string().optional(),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),

  // Google Sheets mirror (optional). Service-account credentials + the shared
  // secret that authenticates the Supabase Database Webhook → /api/sheet-sync.
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(), // PEM; literal \n are unescaped at use
  SHEET_SYNC_SECRET: z.string().optional(),
})
  // In production, the private docs bucket MUST be configured and MUST differ
  // from the public bucket — otherwise contract PDFs (client CIN/passport/
  // address) would be served from a publicly reachable bucket.
  .superRefine((env, ctx) => {
    if (process.env.NODE_ENV !== 'production') return
    if (!env.R2_DOCS_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['R2_DOCS_BUCKET'],
        message: 'required in production — a PRIVATE bucket for PII PDFs (no public access)',
      })
    } else if (env.R2_DOCS_BUCKET === env.R2_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['R2_DOCS_BUCKET'],
        message: 'must differ from the public R2_BUCKET (PII PDFs must not be publicly reachable)',
      })
    }
  })

let cached: z.infer<typeof schema> | null = null

export function serverEnv() {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    )
  }
  cached = parsed.data
  return cached
}
