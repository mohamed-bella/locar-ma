import { cn } from '~/components/ui'
import type { OpStatus } from '~/lib/intelligence'

// Colored PNG icons (public/icons/<group>/<name>.png) so clients read the
// meaning at a glance without reading text. Text labels stay for a11y — the
// icon leads the eye, the word confirms.

export function PngIcon({
  path,
  size = 20,
  className,
  alt = '',
}: {
  path: string
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <img
      src={`/icons/${path}.png`}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={cn('inline-block shrink-0 object-contain', className)}
    />
  )
}

// ── Concept → icon path maps ────────────────────────────
const SERVICE: Record<string, string> = {
  vidange: 'service/vidange',
  pneus: 'service/pneus',
  courroie: 'service/courroie',
  freins: 'service/freins',
  filtre: 'service/filtre',
  batterie: 'service/batterie',
  bougie: 'service/bougie',
  autre: 'service/autre',
}

const STATUS: Record<OpStatus, string> = {
  rentable: 'status/louable',
  watch: 'status/surveiller',
  service_soon: 'status/entretien-bientot',
  not_rentable: 'status/non-louable',
  garage: 'status/garage',
  blocked_admin: 'status/bloque-admin',
  blocked_accident: 'status/accident',
}

const LEGAL: Record<string, string> = {
  insurance: 'legal/assurance',
  vignette: 'legal/vignette',
  visite: 'legal/visite-technique',
}

const SEVERITY: Record<string, string> = {
  low: 'issue/faible',
  medium: 'issue/moyenne',
  critical: 'issue/critique',
}

export const serviceIconPath = (type: string) => SERVICE[type] ?? 'service/autre'
export const statusIconPath = (s: OpStatus) => STATUS[s]
export const legalIconPath = (code: string) => LEGAL[code] ?? 'legal/carte-grise'
export const severityIconPath = (sev: string) => SEVERITY[sev] ?? 'issue/moyenne'

// A single small dot — the only color the minimal UI uses to signal condition.
export function StatusDot({
  status,
  className,
}: {
  status: 'ok' | 'soon' | 'expired' | 'unknown'
  className?: string
}) {
  const color =
    status === 'ok'
      ? 'var(--color-ok)'
      : status === 'soon'
        ? 'var(--color-warn)'
        : status === 'expired'
          ? 'var(--color-danger)'
          : 'var(--color-faint)'
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />
}
