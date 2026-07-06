// Morocco operates on Africa/Casablanca (UTC+1, dropping to UTC+0 during
// Ramadan). Server code runs in UTC on Vercel, so `new Date().toISOString()`
// yields the WRONG calendar day for ~1h around local midnight — a rental
// starting "today" would look like it starts tomorrow, overdue flags flip a day
// early, etc. Always derive the operating day through this helper.
export const AGENCY_TZ = 'Africa/Casablanca'

// Current calendar day in the agency's timezone as `yyyy-mm-dd`.
// en-CA formats as ISO (yyyy-mm-dd), which is what all our date columns use.
export function agencyToday(tz: string = AGENCY_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// A Date anchored at noon of the agency's today — safe to feed to date-fns
// startOfWeek/Month without DST/offset edge cases shifting the day.
export function agencyTodayDate(tz: string = AGENCY_TZ): Date {
  return new Date(`${agencyToday(tz)}T12:00:00`)
}
