import { supabase } from './supabase.js'
import { getOwnerJid } from './config.js'
import { formatNotification } from './format.js'
import { sendText, sendDocument, circuitStatus } from './whatsapp.js'

const MAX_ATTEMPTS = 5

// In-flight IDs — stops Realtime + poll from processing the same row twice.
const inFlight = new Set()

// Transient failures — NOT the notification's fault. The message will go
// through once WhatsApp lets us (recipient replies, account ages, we reconnect).
// These leave the row queued and DON'T burn an attempt, so we retry forever.
const TRANSIENT = [
  'not-connected',
  'nack-463',
  'circuit-open',
  'delivery-timeout',
  'status-error', // WhatsApp status=ERROR (usually the 463 nack arriving as a status update)
]

function isTransient(msg) {
  return TRANSIENT.some((t) => String(msg).startsWith(t))
}

async function markProcessed(id) {
  await supabase
    .from('notification_queue')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', id)
}

// Record the last error for visibility. Only bump attempts for HARD errors —
// transient WhatsApp locks retry indefinitely until they clear.
async function markError(id, error, attempts, hard) {
  await supabase
    .from('notification_queue')
    .update({ error: String(error), attempts: hard ? attempts + 1 : attempts })
    .eq('id', id)
}

async function processNotification(row) {
  const { id, agency_id, type, payload, attempts } = row

  if (attempts >= MAX_ATTEMPTS) {
    console.warn(`Skipping ${id} — max attempts reached`)
    return
  }
  if (inFlight.has(id)) return // already being handled by the other path
  inFlight.add(id)

  try {
    await deliver(id, agency_id, type, payload, attempts)
  } finally {
    inFlight.delete(id)
  }
}

async function deliver(id, agency_id, type, payload, attempts) {
  const jid = await getOwnerJid(agency_id)
  if (!jid) {
    // Hard error — no phone on file. Retrying won't help; give up after MAX.
    console.warn(`No owner phone configured for agency ${agency_id}`)
    await markError(id, 'No owner phone configured', attempts, true)
    return
  }

  try {
    const text = formatNotification(type, payload)
    await sendText(jid, text) // waits for real WhatsApp acceptance

    // Any notification carrying a pdf_url → send the real PDF file (not a link).
    if (payload.pdf_url) {
      await sendPdf(jid, payload)
    }

    await markProcessed(id)
    console.log(`✅ Delivered ${type} → ${jid} (${id})`)
  } catch (err) {
    const transient = isTransient(err.message)
    if (transient) {
      // Left queued — will retry automatically when WhatsApp lets us.
      console.warn(`⏳ Deferred ${id} (${err.message}) — will retry`)
      await markError(id, err.message, attempts, false)
    } else {
      console.error(`❌ Failed ${id} (attempt ${attempts + 1}/${MAX_ATTEMPTS}):`, err.message)
      await markError(id, err.message, attempts, true)
    }
  }
}

// Download the contract PDF from R2 and send it as a WhatsApp document.
async function sendPdf(jid, payload) {
  const res = await fetch(payload.pdf_url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`PDF download HTTP ${res.status}`)

  const ct = res.headers.get('content-type') || ''
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) throw new Error('PDF download empty')
  // R2 sometimes serves an XML error with 200-ish status; guard against non-PDF.
  if (!ct.includes('pdf') && buffer.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(`Not a PDF (content-type: ${ct})`)
  }

  const car = [payload.vehicle, payload.plate].filter(Boolean).join(' ') || 'contrat'
  const fileName = `Contrat-${String(car).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`
  await sendDocument(jid, buffer, 'application/pdf', fileName, '📄 Contrat de location')
  console.log(`  ↳ PDF sent (${buffer.length} bytes)`)
}

// Process any unprocessed notifications. Primary delivery path (poll + startup).
async function drainBacklog({ quiet = false } = {}) {
  // Circuit open (reach-out lock cooldown) → don't even query; nothing can send.
  const cs = circuitStatus()
  if (cs.open) {
    if (!quiet) console.log(`⏸️  Sends paused — reach-out lock cooldown, ${cs.minutesLeft}min left`)
    return
  }

  const { data: pending, error } = await supabase
    .from('notification_queue')
    .select('*')
    .is('processed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(100)

  if (error) {
    console.error('drainBacklog query failed:', error.message)
    return
  }

  if (!pending?.length) {
    if (!quiet) console.log('No backlog to process')
    return
  }

  console.log(`Processing ${pending.length} pending notification(s)...`)
  for (const row of pending) {
    await processNotification(row)
  }
}

const POLL_INTERVAL = 10_000 // 10s safety-net poll

// Subscribe to new inserts via Supabase Realtime, PLUS a polling fallback.
// Realtime postgres_changes runs through RLS — if the service-role subscription
// gets filtered, the poll guarantees delivery. The poll also covers dropped
// Realtime connections and bot restarts.
export async function startListener() {
  // First drain anything that queued while bot was offline.
  await drainBacklog()

  const channel = supabase
    .channel('notification-queue')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notification_queue' },
      async (change) => {
        const row = change.new
        if (row.processed_at) return
        if (circuitStatus().open) return // poll picks it up after cooldown
        await processNotification(row)
      },
    )
    .subscribe((status) => {
      console.log(`Realtime subscription: ${status}`)
    })

  // Safety-net poll — drains anything Realtime missed.
  let polling = false
  setInterval(async () => {
    if (polling) return // avoid overlap on slow sends
    polling = true
    try {
      await drainBacklog({ quiet: true })
    } finally {
      polling = false
    }
  }, POLL_INTERVAL)

  return channel
}
