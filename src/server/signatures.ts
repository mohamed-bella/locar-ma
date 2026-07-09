import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { requireAgencyContext } from './context'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { putObject, docsBucket } from '~/lib/r2.server'
import { DEFAULT_CONTRACT_TERMS } from '~/lib/terms'

const TOKEN_TTL_DAYS = 7

// ── Authenticated: create (or refresh) a signing link for a contract ──────────
export const createSignatureLink = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ contract_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ token: string; path: string }> => {
    const { supabase, agencyId } = await requireAgencyContext()
    // Scope check — the contract must belong to the caller's agency (RLS also enforces).
    const { data: row, error } = await supabase
      .from('contracts')
      .select('id, signed_at')
      .eq('id', data.contract_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!row) throw new Error('Contract not found')
    if ((row as any).signed_at) throw new Error('Ce contrat est déjà signé.')

    const token = randomBytes(24).toString('base64url')
    const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000).toISOString()
    const { error: uErr } = await supabase
      .from('contracts')
      .update({ sign_token: token, sign_token_expires: expires })
      .eq('id', data.contract_id)
    if (uErr) throw new Error(uErr.message)

    return { token, path: `/sign/${token}` }
  })

// ── Public: what the signing page needs (validated by the bearer token) ───────
export type SignatureRequest = {
  ok: boolean
  reason?: 'not_found' | 'expired' | 'already_signed'
  agency: { name: string; logo_url: string | null }
  contract: {
    short_id: string
    client_name: string | null
    vehicle: string | null
    plate: string | null
    date_start: string | null
    date_end: string | null
    total_amount: number | null
  }
  terms: string
  signed_at: string | null
}

const PUBLIC_SELECT =
  'id, signed_at, sign_token_expires, agencies(name, logo_url, contract_terms), reservations(date_start, date_end, total_amount, vehicles(plate, brand, model), clients(full_name))'

export const getSignatureRequest = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<SignatureRequest> => {
    const admin = getSupabaseAdminClient() as any
    const { data: c } = await admin.from('contracts').select(PUBLIC_SELECT).eq('sign_token', data.token).maybeSingle()

    const empty: SignatureRequest = {
      ok: false,
      agency: { name: 'Agence', logo_url: null },
      contract: { short_id: '', client_name: null, vehicle: null, plate: null, date_start: null, date_end: null, total_amount: null },
      terms: '',
      signed_at: null,
    }
    if (!c) return { ...empty, reason: 'not_found' }

    const expired = c.sign_token_expires && new Date(c.sign_token_expires) < new Date()
    const res = c.reservations
    const agencyRow = c.agencies
    const base: SignatureRequest = {
      ok: !c.signed_at && !expired,
      agency: {
        name: agencyRow?.name ?? 'Agence',
        logo_url: agencyRow?.logo_url ?? null,
      },
      contract: {
        short_id: String(c.id).slice(0, 8).toUpperCase(),
        client_name: res?.clients?.full_name ?? null,
        vehicle: [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate || null,
        plate: res?.vehicles?.plate ?? null,
        date_start: res?.date_start ?? null,
        date_end: res?.date_end ?? null,
        total_amount: res?.total_amount ?? null,
      },
      terms: agencyRow?.contract_terms?.trim() || DEFAULT_CONTRACT_TERMS,
      signed_at: c.signed_at ?? null,
    }
    if (c.signed_at) return { ...base, ok: false, reason: 'already_signed' }
    if (expired) return { ...base, ok: false, reason: 'expired' }
    return base
  })

// ── Public: submit the signature ──────────────────────────────────────────────
const submitSchema = z.object({
  token: z.string().min(10),
  agreed: z.literal(true), // must have ticked the box
  signer_name: z.string().trim().min(2).max(120),
  // data:image/png;base64,… — capped to keep a giant paste from bloating storage.
  signature: z
    .string()
    .startsWith('data:image/png;base64,')
    .max(2_000_000),
})

export const submitSignature = createServerFn({ method: 'POST' })
  .validator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = getSupabaseAdminClient() as any
    const { data: c } = await admin
      .from('contracts')
      .select('id, agency_id, signed_at, sign_token_expires')
      .eq('sign_token', data.token)
      .maybeSingle()
    if (!c) throw new Error('Lien invalide.')
    if (c.signed_at) throw new Error('Ce contrat est déjà signé.')
    if (c.sign_token_expires && new Date(c.sign_token_expires) < new Date()) throw new Error('Ce lien a expiré.')

    // Decode the PNG and store it in the PRIVATE docs bucket.
    const b64 = data.signature.split(',')[1] ?? ''
    const buffer = Buffer.from(b64, 'base64')
    if (buffer.length < 200) throw new Error('Signature vide.')
    const key = `agencies/${c.agency_id}/signatures/${c.id}.png`
    await putObject(key, buffer, 'image/png', docsBucket())

    let ip: string | null = null
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null
    } catch {
      /* best effort */
    }

    const { error } = await admin
      .from('contracts')
      .update({
        signature_key: key,
        signer_name: data.signer_name,
        signer_agreed: true,
        signer_ip: ip,
        signed_at: new Date().toISOString(),
        sign_token: null, // consume the token — single use
        sign_token_expires: null,
      })
      .eq('id', c.id)
    if (error) throw new Error(error.message)

    // Regenerate the contract PDF so the signature is baked into the document.
    try {
      const { renderContractPdf } = await import('./pdf.server')
      const { buildSignedPdfData } = await import('./contracts')
      const pdfData = await buildSignedPdfData(c.id)
      if (pdfData) {
        const buf = await renderContractPdf(pdfData)
        const pdfKey = `agencies/${c.agency_id}/contracts/${c.id}.pdf`
        await putObject(pdfKey, buf, 'application/pdf', docsBucket(), `attachment; filename="contrat-${String(c.id).slice(0, 8)}.pdf"`)
        await admin.from('contracts').update({ pdf_key: pdfKey }).eq('id', c.id)
      }
    } catch (e) {
      console.error('[sign] PDF regen failed', e)
      // Signature is saved regardless — PDF can be regenerated from the app.
    }

    return { ok: true }
  })
