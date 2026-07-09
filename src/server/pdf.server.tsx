import { renderToBuffer } from '@react-pdf/renderer'
import { ContractPDF, type ContractPdfData } from '~/components/pdf/ContractPDF'
import { presignDownload, docsBucket } from '~/lib/r2.server'
import { getSupabaseAdminClient } from '~/lib/supabase.server'
import { DETAIL_SELECT, mapDetail, type ContractDetail } from './contracts'

// Server-only. Rendered lazily (dynamic import) so @react-pdf — and every
// server-only helper below — never reaches the client bundle.
export async function renderContractPdf(data: ContractPdfData): Promise<Buffer> {
  return renderToBuffer(<ContractPDF data={data} />)
}

// ContractDetail → the shape the PDF component expects.
function toPdfData(c: ContractDetail) {
  return {
    agency: {
      name: c.agency.name,
      city: c.agency.city,
      logo_url: c.agency.logo_url,
      stamp_url: c.agency.stamp_url,
      legal_name: c.agency.legal_name,
      address: c.agency.address,
      ice: c.agency.ice,
      rc: c.agency.rc,
      patente: c.agency.patente,
      rib: c.agency.rib,
      phone: c.agency.company_phone, // PDF header/footer GSM line
    },
    contract: {
      short_id: c.short_id,
      mileage_out: c.mileage_out,
      mileage_in: c.mileage_in,
      fuel_out: c.fuel_out,
      fuel_in: c.fuel_in,
      check_number: c.check_number,
      check_bank: c.check_bank,
      check_amount: c.check_amount,
      extras: c.extras,
    },
    reservation: c.reservation!,
    vehicle: c.vehicle!,
    client: c.client ?? {
      full_name: 'Client',
      cin_passport: null,
      phone: null,
      address: null,
      nationality: null,
    },
    form: c.form,
    signer_name: c.signer_name,
    signed_at: c.signed_at,
    signature: null as string | null, // filled below (data URL)
  }
}

// react-pdf guesses image format from the URL extension — our R2 keys don't
// always end in .png/.jpg, so it rejects them ("Not valid image extension").
// Fetch the bytes and hand react-pdf a data URL (carries the real MIME type),
// which sidesteps extension detection and any CDN caching entirely.
async function fetchAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || 'image/png'
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return null // never let a missing image break the PDF
  }
}

// toPdfData + inline the logo/stamp/signature images so they always render.
export async function buildPdfData(c: ContractDetail): Promise<ContractPdfData> {
  const data = toPdfData(c)
  const sigUrl = c.signature_key ? await presignDownload(c.signature_key, 600, docsBucket()) : null
  const [logo, stamp, signature] = await Promise.all([
    fetchAsDataUrl(data.agency.logo_url),
    fetchAsDataUrl(data.agency.stamp_url),
    fetchAsDataUrl(sigUrl),
  ])
  data.agency.logo_url = logo
  data.agency.stamp_url = stamp
  data.signature = signature
  return data
}

// Build PDF data for the PUBLIC signing flow (no agency session) — admin lookup
// by id. Used by server/signatures.ts to bake the signature into the PDF.
export async function buildSignedPdfData(contractId: string): Promise<ContractPdfData | null> {
  const admin = getSupabaseAdminClient() as any
  const { data: row } = await admin.from('contracts').select(DETAIL_SELECT).eq('id', contractId).maybeSingle()
  if (!row) return null
  const c = mapDetail(row)
  if (!c.reservation || !c.vehicle) return null
  return buildPdfData(c)
}
