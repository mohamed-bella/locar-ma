import { supabase } from './supabase.js'
import { getOwnerJid } from './config.js'
import { sendText } from './whatsapp.js'

// "Today" in Morocco (Africa/Casablanca) as YYYY-MM-DD.
export function casablancaToday() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date()) // en-CA → YYYY-MM-DD
}

function fdate(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function money(n) {
  return `${Number(n ?? 0).toLocaleString('fr-FR')} DH`
}

// Build the daily digest text for one agency. Returns null if nothing to report
// (no agency), otherwise a formatted WhatsApp message.
export async function buildReport(agencyId, agencyName, today) {
  const [{ data: vehicles }, { data: reservations }, { data: contracts }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('plate, brand, model, status')
      .eq('agency_id', agencyId)
      .order('plate'),
    supabase
      .from('reservations')
      .select('date_start, date_end, status, total_amount, vehicles(plate), clients(full_name)')
      .eq('agency_id', agencyId)
      .neq('status', 'cancelled')
      .gte('date_end', today) // only live/upcoming
      .order('date_start'),
    supabase
      .from('contracts')
      .select('id, closed_at')
      .eq('agency_id', agencyId),
  ])

  const vs = vehicles ?? []
  const rs = reservations ?? []
  const cs = contracts ?? []

  const available = vs.filter((v) => v.status === 'available')
  const rented = vs.filter((v) => v.status === 'rented')

  const departures = rs.filter((r) => r.date_start === today) // pickups today
  const returns = rs.filter((r) => r.date_end === today) // drop-offs today
  const ongoing = rs.filter((r) => r.date_start <= today && r.date_end >= today)
  const openContracts = cs.filter((c) => !c.closed_at)

  const lines = []
  lines.push(`📊 *Rapport journalier — ${agencyName}*`)
  lines.push(`🗓️ ${new Date(`${today}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}`)
  lines.push('')

  // Fleet availability
  lines.push(`🚗 *Voitures disponibles: ${available.length}/${vs.length}*`)
  if (available.length) {
    lines.push(available.map((v) => `  • ${v.plate}${v.brand ? ` (${v.brand})` : ''}`).join('\n'))
  }
  lines.push(`🔴 En location: ${rented.length}`)
  lines.push('')

  // Today's movements
  lines.push(`📅 *Réservations actives: ${ongoing.length}*`)
  if (departures.length) {
    lines.push(`  ➡️ Départs aujourd'hui (${departures.length}):`)
    lines.push(departures.map((r) => `     • ${r.vehicles?.plate ?? '—'} — ${r.clients?.full_name ?? '—'}`).join('\n'))
  }
  if (returns.length) {
    lines.push(`  ⬅️ Retours aujourd'hui (${returns.length}):`)
    lines.push(returns.map((r) => `     • ${r.vehicles?.plate ?? '—'} — ${r.clients?.full_name ?? '—'}`).join('\n'))
  }
  lines.push('')

  // Contracts
  lines.push(`📝 *Contrats ouverts: ${openContracts.length}* (total: ${cs.length})`)

  // Expected revenue from ongoing rentals
  const ongoingRevenue = ongoing.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
  if (ongoingRevenue > 0) {
    lines.push('')
    lines.push(`💰 CA en cours: ${money(ongoingRevenue)}`)
  }

  return lines.join('\n')
}

// Run the daily report for every agency that has a WhatsApp number configured.
export async function runDailyReports() {
  const today = casablancaToday()
  const { data: agencies, error } = await supabase.from('agencies').select('id, name')
  if (error) {
    console.error('[report] failed to list agencies:', error.message)
    return
  }

  console.log(`[report] running daily report for ${agencies?.length ?? 0} agencies (${today})`)
  for (const a of agencies ?? []) {
    const jid = await getOwnerJid(a.id)
    if (!jid) {
      console.log(`[report] skip ${a.name} — no WhatsApp number`)
      continue
    }
    try {
      const text = await buildReport(a.id, a.name, today)
      await sendText(jid, text)
      console.log(`[report] ✅ sent to ${a.name} (${jid})`)
    } catch (e) {
      console.error(`[report] ❌ ${a.name}:`, e.message)
    }
  }
}

// Allow manual run: `node src/report.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { startWhatsApp, connectionReady } = await import('./whatsapp.js')
  await startWhatsApp()
  await connectionReady
  await runDailyReports()
  console.log('[report] done — exiting in 5s')
  setTimeout(() => process.exit(0), 5000)
}
