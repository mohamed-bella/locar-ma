import { Link } from '@tanstack/react-router'
import { useI18n } from '~/lib/i18n'
import { cn } from '~/components/ui'
import { isRentable, type VehicleState } from '~/lib/intelligence'
import { PngIcon, statusIconPath } from './Icon'

export type HealthVehicle = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  image_url: string | null
  mileage: number
}

// Minimal, scannable health card: photo, name, one status line, one next-action
// line. Tap the card to open detail; the check button is the only inline action.
export function HealthCard({
  vehicle,
  state,
  onQuickCheck,
}: {
  vehicle: HealthVehicle
  state: VehicleState
  onQuickCheck: () => void
}) {
  const { t } = useI18n()
  const title = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || vehicle.plate
  const rentable = isRentable(state.status)
  const topReason = state.blocks[0] ?? state.alerts[0]

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-white p-4 transition hover:border-[var(--color-line-strong)]',
        rentable ? 'border-[var(--color-line)]' : 'border-[var(--color-danger)]/30',
      )}
    >
      {/* Whole-card link overlay — keeps markup flat, action button sits above */}
      <Link
        to="/suivi/$vehicleId"
        params={{ vehicleId: vehicle.id }}
        className="absolute inset-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-ring)]"
        aria-label={title}
      />

      <div className="flex items-center gap-3">
        {vehicle.image_url ? (
          <img
            src={vehicle.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-14 shrink-0 rounded-xl bg-[var(--color-surface-muted)] object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-lg font-bold text-[var(--color-faint)]">
            {title[0]?.toUpperCase() ?? '?'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-[var(--color-ink)]">{title}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-[var(--color-faint)]">{vehicle.plate}</div>
        </div>
        <PngIcon path={statusIconPath(state.status)} size={26} />
      </div>

      {/* One status line + one next line — nothing else */}
      <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-soft)]">
        {t(`si.status.${state.status}`)}
      </div>
      <div className="mt-0.5 min-h-[1.25rem] truncate text-xs text-[var(--color-muted)]">
        {topReason ? t(topReason.label.key, topReason.label.params) : t('si.canRent')}
      </div>

      <button
        onClick={onQuickCheck}
        className="relative z-10 mt-3 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-[var(--color-line)] px-3 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
      >
        <PngIcon path="action/check-rapide" size={16} /> {t('si.quickCheck')}
      </button>
    </div>
  )
}
