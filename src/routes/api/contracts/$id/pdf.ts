import { createFileRoute } from '@tanstack/react-router'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { presignDownload, putObject, docsBucket } from '~/lib/r2.server'
import { DETAIL_SELECT, mapDetail } from '~/server/contracts'

// Mobile-facing PDF endpoint. The web app authenticates via session cookie, but
// the native app holds a Supabase JWT — so this route accepts a Bearer token,
// verifies it, scopes strictly to the caller's agency, then generates (or reuses)
// the exact same server-rendered contract PDF the web app produces and returns a
// short-lived presigned download URL. Contracts hold PII → private bucket only.
//
//   GET  /api/contracts/:id/pdf            → reuse stored PDF if present, else generate
//   GET  /api/contracts/:id/pdf?force=1    → always regenerate (e.g. after signing)
//
// Auth: Authorization: Bearer <supabase_access_token>
export const Route = createFileRoute('/api/contracts/$id/pdf')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          })

        // 1) Bearer token
        const authz = request.headers.get('authorization') || request.headers.get('Authorization')
        const token = authz?.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : null
        if (!token) return json({ error: 'Missing bearer token' }, 401)

        const admin = getSupabaseAdminClient() as any

        // 2) Verify token → user
        const { data: userData, error: userErr } = await admin.auth.getUser(token)
        const user = userData?.user
        if (userErr || !user) return json({ error: 'Invalid token' }, 401)

        // 3) Contract (admin bypasses RLS; we scope by agency manually below)
        const contractId = params.id
        const { data: row, error: rowErr } = await admin
          .from('contracts')
          .select(DETAIL_SELECT + ', agency_id')
          .eq('id', contractId)
          .maybeSingle()
        if (rowErr) return json({ error: rowErr.message }, 500)
        if (!row) return json({ error: 'Contract not found' }, 404)

        const agencyId = (row as any).agency_id as string

        // 4) Caller must belong to that agency
        const { data: membership } = await admin
          .from('agency_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('agency_id', agencyId)
          .maybeSingle()
        if (!membership) return json({ error: 'Forbidden' }, 403)

        const force = new URL(request.url).searchParams.get('force')

        // 5) Reuse stored PDF unless force-regenerating
        const existingKey = (row as any).pdf_key as string | null
        if (existingKey && !force) {
          const url = await presignDownload(existingKey, 3600, docsBucket())
          return json({ url, regenerated: false })
        }

        // 6) Generate, store, return presigned URL (mirrors generateContractPdf)
        const c = mapDetail(row)
        if (!c.reservation || !c.vehicle) return json({ error: 'Contract missing reservation or vehicle' }, 422)

        const { renderContractPdf, buildPdfData } = await import('~/server/pdf.server')
        const buffer = await renderContractPdf(await buildPdfData(c))

        const key = `agencies/${agencyId}/contracts/${c.id}.pdf`
        const carName =
          [c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(' ') || c.vehicle?.plate || 'contrat'
        const dateStr = c.reservation?.date_start || c.created_at?.slice(0, 10) || ''
        const safe =
          `${carName} ${dateStr}`
            .normalize('NFD')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'contrat'
        const filename = `${safe}.pdf`

        await putObject(key, buffer, 'application/pdf', docsBucket(), `attachment; filename="${filename}"`)
        await admin.from('contracts').update({ pdf_key: key }).eq('id', c.id)

        const url = await presignDownload(key, 3600, docsBucket())
        return json({ url, filename, regenerated: true })
      },
    },
  },
})
