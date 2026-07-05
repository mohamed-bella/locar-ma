import type { Reservation } from '~/server/reservations'

// Bar styles on the timeline, keyed by reservation status.
export const RES_BAR_STYLE: Record<string, string> = {
  pending: 'bg-[#f5a623] text-white',
  confirmed: 'bg-[var(--color-info)] text-white',
  active: 'bg-[var(--color-ok)] text-white',
  closed: 'bg-[var(--color-faint)] text-white',
  blocked:
    'text-[var(--color-ink-soft)] bg-[repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb_6px,#d1d5db_6px,#d1d5db_12px)]',
}

export function resBadgeTone(
  status: string,
): 'ok' | 'info' | 'warn' | 'neutral' | 'danger' {
  switch (status) {
    case 'active':
      return 'ok'
    case 'confirmed':
      return 'info'
    case 'pending':
      return 'warn'
    case 'cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function reservationLabel(r: Reservation) {
  if (r.is_block) return r.notes || 'Blocked'
  return r.client_name || 'Reservation'
}
