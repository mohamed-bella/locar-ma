import { getAuthorizedAgency } from './auth.js'
import { buildFleetReportPdf } from './report-pdf.js'
import { sendText, sendDocument } from './whatsapp.js'
import { casablancaToday } from './report.js'

const REPORT_WORDS = new Set(['rapport', 'report', 'تقرير'])
const HELP =
  'Commandes disponibles :\n• *rapport* — rapport complet de la flotte (PDF)\n\n' +
  'الأوامر المتاحة:\n• *تقرير* — تقرير كامل للأسطول (PDF)'

// Per-sender cooldown — one report every 2 min. PDF generation is CPU-heavy
// (image conversion + multi-page render) and runs on the single event loop;
// without this, rapid "rapport" messages would block ALL agencies' traffic.
const COOLDOWN_MS = 2 * 60 * 1000
const lastReportAt = new Map() // phone -> ts

// Per-agency report cache — reuse a freshly built PDF for repeat requests.
const REPORT_CACHE_MS = 5 * 60 * 1000
const reportCache = new Map() // agencyId -> { buf, ts }

async function getReport(agencyId) {
  const hit = reportCache.get(agencyId)
  if (hit && Date.now() - hit.ts < REPORT_CACHE_MS) return hit.buf
  const buf = await buildFleetReportPdf(agencyId)
  reportCache.set(agencyId, { buf, ts: Date.now() })
  return buf
}

// Handle one inbound WhatsApp message. STRICT: numbers not saved in the DB get
// ZERO response — we return before sending anything at all.
export async function handleIncomingMessage(msg) {
  const jid = msg?.key?.remoteJid
  if (!jid || msg.key.fromMe) return
  // Only 1:1 chats. Accept both classic (@s.whatsapp.net) and the newer
  // linked-ID (@lid) addressing WhatsApp/Baileys now uses. Ignore groups,
  // broadcasts, status, newsletters.
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return

  const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
  if (!text) return

  // Resolve the real phone number. For @lid, Baileys puts the phone-number JID
  // in remoteJidAlt / senderPn; fall back to the local part only for @s.whatsapp.net.
  let phoneJid = jid
  if (jid.endsWith('@lid')) {
    phoneJid = msg.key?.remoteJidAlt || msg.key?.senderPn || msg.key?.participantPn || ''
  }
  const phone = (phoneJid || '').split('@')[0].split(':')[0]
  if (!phone) {
    console.log(`[cmd] could not resolve phone for jid=${jid} — ignoring`)
    return
  }

  // ── Authorization gate ──────────────────────────────────────────────
  const agency = await getAuthorizedAgency(phone)
  if (!agency) {
    // Unknown number → stay completely silent. Never respond, ever.
    console.log(`[cmd] ignored message from unauthorized number ${phone}`)
    return
  }

  const cmd = text.toLowerCase()
  try {
    if (REPORT_WORDS.has(cmd)) {
      // Rate limit per sender.
      const last = lastReportAt.get(phone) ?? 0
      const waitMs = COOLDOWN_MS - (Date.now() - last)
      if (waitMs > 0) {
        await sendText(jid, `⏳ Rapport déjà demandé. Réessayez dans ${Math.ceil(waitMs / 60000)} min.`)
        return
      }
      lastReportAt.set(phone, Date.now())

      console.log(`[cmd] "rapport" from ${agency.name} (${phone})`)
      await sendText(jid, '📄 Génération du rapport en cours… · جاري إنشاء التقرير…')
      const pdf = await getReport(agency.id)
      const fileName = `Rapport-${String(agency.name).replace(/[^a-zA-Z0-9]+/g, '-')}-${casablancaToday()}.pdf`
      await sendDocument(jid, pdf, 'application/pdf', fileName, '📊 Rapport de flotte · تقرير الأسطول')
      console.log(`[cmd] ✅ report sent to ${agency.name}`)
    } else {
      await sendText(jid, HELP)
    }
  } catch (err) {
    console.error(`[cmd] failed for ${agency.name}:`, err.message)
    try {
      await sendText(jid, '❌ Erreur lors de la génération. Réessayez plus tard.')
    } catch {
      /* ignore secondary failure */
    }
  }
}
