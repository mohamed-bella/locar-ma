// Daily document-expiry digest → emails each agency owner the vehicles whose
// insurance / vignette / visite technique is expired or expiring within the
// agency's configured threshold (document_alert_rules; default 30 days).
//
// Not event-driven (there's no in-app trigger), so a scheduler must call it:
//   GET /api/expiry-alerts   with  Authorization: Bearer <CRON_SECRET>
// On Vercel Hobby use a free external cron (cron-job.org / GitHub Actions) daily.
// Self-contained (own Resend + Supabase), like the sheets functions.
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

const ACCENT = '#1d5b8d'
const FIELDS = [
  { key: 'insurance_expiry', label: 'Assurance' },
  { key: 'vignette_expiry', label: 'Vignette' },
  { key: 'visite_tech_expiry', label: 'Visite technique' },
]

function admin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function daysUntil(d) {
  if (!d) return null
  const dt = new Date(`${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((dt.getTime() - now.getTime()) / 86_400_000)
}
function fdate(d) {
  const dt = new Date(`${d}T00:00:00`)
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}
const esc = (s) => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function sendEmail(to, subject, html) {
  if (!to) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to, subject, html }),
  })
  if (!res.ok) console.error('resend', res.status, await res.text())
}

async function ownerEmail(supa, agencyId) {
  const { data: m } = await supa.from('agency_members').select('user_id').eq('agency_id', agencyId).eq('role', 'owner').limit(1).maybeSingle()
  if (!m?.user_id) return null
  const { data: u } = await supa.auth.admin.getUserById(m.user_id)
  return u?.user?.email ?? null
}

function digestHtml(agencyName, items) {
  const rows = items.map((a) => {
    const state = a.days < 0 ? `Expiré (${-a.days} j)` : a.days === 0 ? "Expire aujourd'hui" : `Dans ${a.days} j`
    const color = a.days < 0 ? '#b91c1c' : a.days <= 7 ? '#c2410c' : '#64748b'
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:14px;color:#0f172a;font-weight:600">${esc(a.car)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:13px;color:#475569">${esc(a.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:13px;color:#475569">${esc(fdate(a.date))}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eef1f4;font-size:13px;color:${color};font-weight:600">${esc(state)}</td>
    </tr>`
  }).join('')
  return `
  <div style="background:#f4f6f8;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border:1px solid #e6e9ee;border-radius:14px;overflow:hidden;">
        <tr><td style="background:${ACCENT};padding:18px 28px;"><span style="color:#fff;font-size:16px;font-weight:700">${esc(agencyName)}</span></td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 6px;font-size:18px;color:#0f172a;">Documents à renouveler</h1>
          <p style="margin:0 0 18px;font-size:14px;color:#475569;">${items.length} véhicule(s) avec un document expiré ou proche de l'échéance.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase">Véhicule</td>
              <td style="padding:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase">Document</td>
              <td style="padding:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase">Échéance</td>
              <td style="padding:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase">Statut</td>
            </tr>
            ${rows}
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eef1f4;"><p style="margin:0;font-size:12px;color:#94a3b8;">Notification automatique · ${esc(agencyName)}</p></td></tr>
      </table>
    </td></tr></table>
  </div>`
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || '\0'
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (bearer !== secret && (req.headers['x-cron-secret'] || '') !== secret) {
    res.statusCode = 401; res.end('unauthorized'); return
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    res.statusCode = 200; res.end(JSON.stringify({ skipped: 'email not configured' })); return
  }

  try {
    const supa = admin()
    const [{ data: agencies }, { data: rules }, { data: vehicles }] = await Promise.all([
      supa.from('agencies').select('id, name'),
      supa.from('document_alert_rules').select('agency_id, field, label, threshold_days'),
      supa.from('vehicles').select('id, plate, brand, model, agency_id, insurance_expiry, vignette_expiry, visite_tech_expiry, document_expiries'),
    ])

    // rules by agency; fall back to a 30-day rule per field when none defined
    const rulesByAgency = {}
    for (const r of rules || []) (rulesByAgency[r.agency_id] ||= []).push(r)
    const defaultRules = FIELDS.map((f) => ({ field: f.key, label: f.label, threshold_days: 30 }))

    const byAgency = {}
    for (const v of vehicles || []) {
      const ars = rulesByAgency[v.agency_id] || defaultRules
      for (const rule of ars) {
        const fld = FIELDS.find((f) => f.key === rule.field)
        if (!fld) continue
        const date = v[rule.field] || v.document_expiries?.[rule.field]
        const days = daysUntil(date)
        if (days === null || days > rule.threshold_days) continue
        const car = [v.brand, v.model].filter(Boolean).join(' ') || v.plate || '—'
        ;(byAgency[v.agency_id] ||= []).push({ car: `${car}${v.plate ? ` (${v.plate})` : ''}`, label: fld.label, date, days })
      }
    }

    let sent = 0
    for (const agency of agencies || []) {
      const items = byAgency[agency.id]
      if (!items || items.length === 0) continue
      items.sort((a, b) => a.days - b.days)
      const email = await ownerEmail(supa, agency.id)
      if (!email) continue
      await sendEmail(email, `${items.length} document(s) à renouveler — ${agency.name}`, digestHtml(agency.name, items))
      sent++
    }

    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true, agenciesNotified: sent }))
  } catch (e) {
    console.error('expiry-alerts', e)
    res.statusCode = 500; res.end('error: ' + (e?.message || String(e)))
  }
}
