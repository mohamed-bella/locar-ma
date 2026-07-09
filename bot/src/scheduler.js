import { REPORT_HOUR } from './config.js'
import { runDailyReports } from './report.js'
import { supabase } from './supabase.js'

// Purge processed notifications older than 30 days so the queue never bloats.
async function purgeOldNotifications() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { error } = await supabase
    .from('notification_queue')
    .delete()
    .not('processed_at', 'is', null)
    .lt('processed_at', cutoff)
  if (error) console.error('[cleanup] purge failed:', error.message)
  else console.log('[cleanup] purged processed notifications older than 30 days')
}

// Casablanca-local {date, hour} right now.
function nowCasablanca() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

// Fire runDailyReports once per day at REPORT_HOUR (Casablanca). Polls every
// 5 min and de-dupes with the last-sent date so it fires exactly once even if
// the tick lands twice in the same hour.
export function startScheduler() {
  const reportsOn = REPORT_HOUR != null && !Number.isNaN(REPORT_HOUR)
  console.log(
    reportsOn
      ? `📅 Daily report scheduled for ${String(REPORT_HOUR).padStart(2, '0')}:00 Casablanca time`
      : '📅 Daily report disabled (set REPORT_HOUR to enable)',
  )

  let lastReportDate = null
  let lastCleanupDate = null

  const tick = async () => {
    const { date, hour } = nowCasablanca()

    if (reportsOn && hour === REPORT_HOUR && lastReportDate !== date) {
      lastReportDate = date
      try {
        await runDailyReports()
      } catch (e) {
        console.error('[scheduler] report run failed:', e.message)
      }
    }

    // Queue cleanup runs once/day regardless of whether reports are enabled.
    if (hour === 3 && lastCleanupDate !== date) {
      lastCleanupDate = date
      await purgeOldNotifications().catch(() => {})
    }
  }

  setInterval(tick, 5 * 60 * 1000) // every 5 min
  void tick()
}
