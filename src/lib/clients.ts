export function clientStatusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'ok'
    case 'flagged':
      return 'warn'
    case 'blacklisted':
      return 'danger'
    default:
      return 'neutral'
  }
}
