import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from 'baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { rm } from 'fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = join(__dirname, '..', 'auth_info')

let sock = null
let connected = false // tracked from connection.update — reliable across versions
let incomingHandler = null // set by index.js — handles inbound messages (commands)

// Register a handler for inbound WhatsApp messages.
export function onIncoming(cb) {
  incomingHandler = cb
}

// Bounded set of recently-seen message ids to drop Baileys redeliveries.
const seenMessageIds = new Set()
const SEEN_MAX = 500
function rememberMessageId(id) {
  seenMessageIds.add(id)
  if (seenMessageIds.size > SEEN_MAX) {
    // drop the oldest ~100 (insertion order preserved by Set)
    const it = seenMessageIds.values()
    for (let i = 0; i < 100; i++) seenMessageIds.delete(it.next().value)
  }
}
let starting = false // guard: never run two connect attempts at once
let reconnectAttempts = 0
const MAX_BACKOFF = 30_000

// ── Delivery tracking ────────────────────────────────────────────────
// sendMessage() resolves BEFORE WhatsApp confirms delivery, so its return is
// NOT proof of delivery. We instead resolve a send only when the message's
// status reaches SERVER_ACK (WhatsApp accepted it) via messages.update — and
// reject when WhatsApp nacks it (e.g. the 463 reach-out time-lock, surfaced
// through the logger). This is the source of truth.
const pending = new Map() // msgId -> { resolve, reject, timer }
const ACK_TIMEOUT = 20_000

// Baileys proto status: ERROR=0, PENDING=1, SERVER_ACK=2, DELIVERY_ACK=3, READ=4
const SERVER_ACK = 2

// ── 463 circuit breaker ──────────────────────────────────────────────
// Each 463 (NackCallerReachoutTimelocked) worsens the lock. After a few in a
// row we OPEN the circuit and stop sending for a cooldown — sends fail fast
// (rows stay queued) instead of hammering WhatsApp. Any real delivery closes it.
let consecutiveNacks = 0
let circuitOpenUntil = 0
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN = 10 * 60 * 1000 // 10 min

function circuitOpen() {
  return Date.now() < circuitOpenUntil
}
export function circuitStatus() {
  if (!circuitOpen()) return { open: false }
  return { open: true, minutesLeft: Math.ceil((circuitOpenUntil - Date.now()) / 60_000) }
}

function onAckError(msgId, code) {
  if (code === '463') {
    consecutiveNacks += 1
    if (consecutiveNacks >= BREAKER_THRESHOLD && !circuitOpen()) {
      circuitOpenUntil = Date.now() + BREAKER_COOLDOWN
      console.warn(
        `⚠️  ${consecutiveNacks}× error 463 (WhatsApp reach-out time-lock). ` +
          `Pausing sends for ${BREAKER_COOLDOWN / 60_000} min. ` +
          `Fix: recipient must message the bot first, or let the account age.`,
      )
    }
  }
  const p = pending.get(msgId)
  if (p) {
    clearTimeout(p.timer)
    pending.delete(msgId)
    p.reject(new Error(`nack-${code}`))
  }
}

function onStatusUpdate(msgId, status) {
  const p = pending.get(msgId)
  if (!p) return
  if (status >= SERVER_ACK) {
    // WhatsApp accepted it → will deliver even if recipient is offline.
    consecutiveNacks = 0
    circuitOpenUntil = 0
    clearTimeout(p.timer)
    pending.delete(msgId)
    p.resolve(status)
  } else if (status === 0) {
    clearTimeout(p.timer)
    pending.delete(msgId)
    p.reject(new Error('status-error'))
  }
  // status PENDING(1) → keep waiting for the timeout.
}

// Send, then wait for real WhatsApp acceptance. Rejects on nack/timeout so the
// caller can leave the row queued for a later retry.
async function sendConfirmed(jid, content) {
  if (!isConnected()) throw new Error('not-connected')
  const cs = circuitStatus()
  if (cs.open) throw new Error(`circuit-open-${cs.minutesLeft}min`)

  const sent = await sock.sendMessage(jid, content)
  const id = sent?.key?.id
  if (!id) throw new Error('no-message-id')

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('delivery-timeout'))
    }, ACK_TIMEOUT)
    pending.set(id, { resolve, reject, timer })
  })
}

// ── Logger that intercepts ack errors + silences benign noise ─────────
function makeLogger(base) {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'warn') {
        return (obj, msg, ...rest) => {
          // Ack errors surface in two shapes across Baileys versions:
          //  6.x: msg='received error in ack', obj.attrs.{id,error}
          //  7.x: msg='error 463: ... missing tctoken ...', obj.{msgId,from}
          const text = typeof obj === 'string' ? obj : msg
          if (typeof text === 'string') {
            const codeMatch = text.match(/error\s+(\d+)/i)
            const isAck = text.includes('received error in ack') || codeMatch
            if (isAck) {
              const code = codeMatch ? codeMatch[1] : String(obj?.attrs?.error ?? '')
              const id = String(obj?.msgId ?? obj?.attrs?.id ?? '')
              onAckError(id, code)
              return // swallow raw noise; we log a clean summary instead
            }
          }
          return target.warn(obj, msg, ...rest)
        }
      }
      if (prop === 'error') {
        return (obj, msg, ...rest) => {
          const m = typeof obj === 'string' ? obj : msg
          // The chat-history "init queries" timeout is harmless (we don't sync
          // history) — drop it so it stops scaring everyone.
          if (typeof m === 'string' && m.includes('init queries')) return
          return target.error(obj, msg, ...rest)
        }
      }
      if (prop === 'child') {
        return (bindings) => makeLogger(target.child(bindings))
      }
      const val = Reflect.get(target, prop, receiver)
      return typeof val === 'function' ? val.bind(target) : val
    },
  })
}

const logger = makeLogger(pino({ level: 'warn' }))

// ── Connection ───────────────────────────────────────────────────────
let connectionResolve = null
export const connectionReady = new Promise((resolve) => {
  connectionResolve = resolve
})

export function isConnected() {
  return connected && !!sock
}

async function wipeAuth() {
  try {
    await rm(AUTH_DIR, { recursive: true, force: true })
    console.log('🗑️  Cleared auth_info (logged out) — restart to scan a new QR')
  } catch (e) {
    console.error('Failed to clear auth_info:', e.message)
  }
}

function scheduleReconnect() {
  reconnectAttempts += 1
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_BACKOFF)
  console.log(`↻ Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`)
  setTimeout(() => {
    connect().catch((e) => console.error('Reconnect failed:', e.message))
  }, delay)
}

async function connect() {
  if (starting) return sock
  starting = true

  try {
    if (sock) {
      sock.ev.removeAllListeners('connection.update')
      sock.ev.removeAllListeners('creds.update')
      sock.ev.removeAllListeners('messages.update')
      sock.ev.removeAllListeners('messages.upsert')
      try {
        sock.ws?.close()
      } catch {}
      sock = null
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Locar Bot', 'Chrome', '4.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', handleConnectionUpdate)

    // Real delivery signal — resolve/reject pending sends by message id.
    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const id = u.key?.id
        const status = u.update?.status
        if (id != null && status != null) onStatusUpdate(id, status)
      }
    })

    // Inbound messages → command handler (only real, new messages).
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const m of messages) {
        const jid = m.key?.remoteJid
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
        console.log(`[inbound] type=${type} fromMe=${m.key?.fromMe} jid=${jid} text=${JSON.stringify(text)}`)
      }
      if (type !== 'notify' || !incomingHandler) return
      for (const m of messages) {
        const id = m.key?.id
        if (id && seenMessageIds.has(id)) continue // Baileys can redeliver — dedupe
        if (id) rememberMessageId(id)
        try {
          await incomingHandler(m)
        } catch (e) {
          console.error('incoming handler error:', e.message)
        }
      }
    })
  } finally {
    starting = false
  }

  return sock
}

function handleConnectionUpdate(update) {
  const { connection, lastDisconnect, qr } = update

  if (qr) {
    console.log('\n📱 Scan this QR code with WhatsApp (Linked Devices):\n')
    qrcode.generate(qr, { small: true })
  }

  if (connection === 'open') {
    connected = true
    reconnectAttempts = 0
    console.log('✅ WhatsApp connected')
    connectionResolve?.(true)
    return
  }

  if (connection === 'close') {
    connected = false
    const code = lastDisconnect?.error?.output?.statusCode
    const reasonName =
      Object.keys(DisconnectReason).find((k) => DisconnectReason[k] === code) ?? 'unknown'
    console.log(`WhatsApp closed — code ${code} (${reasonName})`)

    switch (code) {
      case DisconnectReason.loggedOut:
      case DisconnectReason.forbidden:
        wipeAuth().then(() => process.exit(1))
        return
      case DisconnectReason.connectionReplaced:
        console.warn('Connection replaced by another session. Waiting 60s before retry.')
        setTimeout(() => connect().catch(() => {}), 60_000)
        return
      case DisconnectReason.restartRequired:
        connect().catch((e) => console.error('Restart failed:', e.message))
        return
      default:
        scheduleReconnect()
        return
    }
  }
}

export async function startWhatsApp() {
  return connect()
}

// Public send API — both WAIT for real WhatsApp acceptance (throw on failure).
export async function sendText(jid, text) {
  await sendConfirmed(jid, { text })
}

export async function sendDocument(jid, buffer, mimetype, fileName, caption) {
  await sendConfirmed(jid, { document: buffer, mimetype, fileName, caption })
}

export function getSocket() {
  return sock
}
