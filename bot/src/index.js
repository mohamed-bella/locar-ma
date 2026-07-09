// libsignal dumps raw "Closing session: SessionEntry {…}" blobs via console.log
// on every key ratchet — pure noise. Filter them out at the source.
const _log = console.log.bind(console)
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Closing session')) return
  _log(...args)
}

import { createServer } from 'node:http'
import { startWhatsApp, connectionReady, onIncoming, isConnected } from './whatsapp.js'
import { startListener } from './listener.js'
import { startScheduler } from './scheduler.js'
import { handleIncomingMessage } from './commands.js'

console.log('🤖 Locar WhatsApp Bot starting...\n')

// Health endpoint — CapRover (and any orchestrator) health-checks a port.
// Start it FIRST so the container is reachable immediately, even while the
// first-run QR is still waiting to be scanned (connectionReady blocks below).
const PORT = process.env.PORT || 80
createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', whatsapp: isConnected() ? 'connected' : 'connecting' }))
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT, () => console.log(`🩺 Health server on :${PORT}`))

// 0. Wire inbound command handling (authorized numbers only)
onIncoming(handleIncomingMessage)

// 1. Connect to WhatsApp (shows QR on first run)
await startWhatsApp()

// 2. Wait for connection to be ready
await connectionReady

// 3. Start listening for notifications from Supabase
await startListener()

// 4. Schedule the daily report (if REPORT_HOUR is set)
startScheduler()

console.log('\n🟢 Bot running — listening for notifications')

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  process.exit(0)
})
