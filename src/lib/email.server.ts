// Transactional email via Resend (plain REST — no SDK, keeps the bundle small).
// French, minimal, owner-only notifications. Every notify* function is
// best-effort and NEVER throws: a mail failure must not break the mutation that
// triggered it.
import { waitUntil } from '@vercel/functions'
import { getSupabaseAdminClient } from './supabase.server'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const ACCENT = '#1d5b8d'

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
}

// Run a notification WITHOUT blocking the request. On Vercel, waitUntil keeps
// the function alive until the promise settles but lets the response return
// immediately — so a slow/hung email never counts against the mutation's 30s
// budget. Off Vercel (local/dev) waitUntil throws → we let it run detached.
// The promise already swallows its own errors (notify* never throw).
export function scheduleNotify(p: Promise<unknown>): void {
  const guarded = Promise.resolve(p).catch((e) => console.error('notify failed', e))
  try {
    waitUntil(guarded)
  } catch {
    void guarded
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!emailConfigured() || !to) return
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to, subject, html }),
      signal: AbortSignal.timeout(8000), // never let a hung request pile up
    })
    if (!res.ok) console.error('resend', res.status, await res.text())
  } catch (e) {
    console.error('resend send failed', e)
  }
}

// Resolve the agency owner's email (from auth.users) + the agency name.
async function ownerContext(agencyId: string): Promise<{ email: string | null; agencyName: string }> {
  const admin = getSupabaseAdminClient() as any
  const [{ data: member }, { data: agency }] = await Promise.all([
    admin.from('agency_members').select('user_id').eq('agency_id', agencyId).eq('role', 'owner').limit(1).maybeSingle(),
    admin.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
  ])
  const agencyName = agency?.name ?? 'Votre agence'
  if (!member?.user_id) return { email: null, agencyName }
  const { data: u } = await admin.auth.admin.getUserById(member.user_id)
  return { email: u?.user?.email ?? null, agencyName }
}

// ── formatting helpers (French / Morocco) ──
function fdate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('fr-FR')} MAD`
}
const esc = (s: unknown) =>
  String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── shared minimal layout (inline CSS — email clients ignore <style>) ──
function layout(agencyName: string, heading: string, intro: string, rows: [string, string][]): string {
  const rowsHtml = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:13px;color:#64748b;width:42%">${esc(k)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:14px;color:#0f172a;font-weight:600">${esc(v)}</td>
      </tr>`,
    )
    .join('')
  return `
  <div style="background:#f4f6f8;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#ffffff;border:1px solid #e6e9ee;border-radius:14px;overflow:hidden;">
        <tr><td style="background:${ACCENT};padding:18px 28px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:.2px;">${esc(agencyName)}</span>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 6px;font-size:18px;line-height:1.3;color:#0f172a;">${esc(heading)}</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#475569;">${esc(intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eef1f4;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">Notification automatique · ${esc(agencyName)}</p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`
}

// ── event notifications (owner-only, best-effort) ──

export async function notifyNewReservation(agencyId: string, reservationId: string): Promise<void> {
  if (!emailConfigured()) return
  try {
    const admin = getSupabaseAdminClient() as any
    const { data: r } = await admin
      .from('reservations')
      .select('date_start, date_end, total_amount, status, vehicles(plate, brand, model), clients(full_name)')
      .eq('id', reservationId)
      .maybeSingle()
    if (!r) return
    const { email, agencyName } = await ownerContext(agencyId)
    if (!email) return
    const car = [r.vehicles?.brand, r.vehicles?.model].filter(Boolean).join(' ') || r.vehicles?.plate || '—'
    const html = layout(agencyName, 'Nouvelle réservation', 'Une nouvelle réservation vient d’être enregistrée.', [
      ['Véhicule', `${car}${r.vehicles?.plate ? ` (${r.vehicles.plate})` : ''}`],
      ['Client', r.clients?.full_name ?? '—'],
      ['Du', fdate(r.date_start)],
      ['Au', fdate(r.date_end)],
      ['Montant', money(r.total_amount)],
      ['Statut', r.status ?? '—'],
    ])
    await sendEmail(email, `Nouvelle réservation — ${car}`, html)
  } catch (e) {
    console.error('notifyNewReservation', e)
  }
}

export async function notifyVehicle(agencyId: string, vehicleId: string, isNew: boolean): Promise<void> {
  if (!emailConfigured()) return
  try {
    const admin = getSupabaseAdminClient() as any
    const { data: v } = await admin
      .from('vehicles')
      .select('plate, brand, model, year, category, daily_rate, status')
      .eq('id', vehicleId)
      .maybeSingle()
    if (!v) return
    const { email, agencyName } = await ownerContext(agencyId)
    if (!email) return
    const car = [v.brand, v.model].filter(Boolean).join(' ') || v.plate || '—'
    const heading = isNew ? 'Nouveau véhicule ajouté' : 'Véhicule mis à jour'
    const intro = isNew
      ? 'Un véhicule vient d’être ajouté à votre flotte.'
      : 'Les informations d’un véhicule ont été modifiées.'
    const html = layout(agencyName, heading, intro, [
      ['Véhicule', car],
      ['Immatriculation', v.plate ?? '—'],
      ['Année', v.year ? String(v.year) : '—'],
      ['Catégorie', v.category ?? '—'],
      ['Tarif / jour', money(v.daily_rate)],
      ['Statut', v.status ?? '—'],
    ])
    await sendEmail(email, `${heading} — ${car}`, html)
  } catch (e) {
    console.error('notifyVehicle', e)
  }
}

export async function notifyNewContract(agencyId: string, contractId: string): Promise<void> {
  if (!emailConfigured()) return
  try {
    const admin = getSupabaseAdminClient() as any
    const { data: c } = await admin
      .from('contracts')
      .select('created_at, check_amount, reservations(date_start, date_end, vehicles(plate, brand, model), clients(full_name))')
      .eq('id', contractId)
      .maybeSingle()
    if (!c) return
    const { email, agencyName } = await ownerContext(agencyId)
    if (!email) return
    const res = c.reservations
    const car = [res?.vehicles?.brand, res?.vehicles?.model].filter(Boolean).join(' ') || res?.vehicles?.plate || '—'
    const html = layout(agencyName, 'Nouveau contrat', 'Un contrat de location vient d’être créé.', [
      ['Véhicule', `${car}${res?.vehicles?.plate ? ` (${res.vehicles.plate})` : ''}`],
      ['Client', res?.clients?.full_name ?? '—'],
      ['Du', fdate(res?.date_start)],
      ['Au', fdate(res?.date_end)],
      ['Caution', money(c.check_amount)],
    ])
    await sendEmail(email, `Nouveau contrat — ${car}`, html)
  } catch (e) {
    console.error('notifyNewContract', e)
  }
}
