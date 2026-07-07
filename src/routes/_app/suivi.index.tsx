import { useMemo, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { listVehicles } from '~/server/fleet'
import { listAlertRules } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { getFleetMaintenance } from '~/server/maintenance'
import { listOpenIssues } from '~/server/intelligence'
import { stateForVehicle } from '~/lib/suivi'
import { isRentable } from '~/lib/intelligence'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import { PageHeader } from '~/components/ui'
import { HealthCard, type HealthVehicle } from '~/components/suivi/HealthCard'
import { QuickCheckDialog } from '~/components/suivi/QuickCheckDialog'
import { PngIcon } from '~/components/suivi/Icon'
import { SuiviGridSkeleton } from '~/components/Skeletons'

export const Route = createFileRoute('/_app/suivi/')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes, maintenance, issues] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
      getFleetMaintenance(),
      listOpenIssues(),
    ])
    return { vehicles, alertRules, documentTypes, maintenance, issues }
  },
  component: SuiviGrid,
  pendingComponent: SuiviGridSkeleton,
})

function SuiviGrid() {
  const { vehicles, alertRules, documentTypes, maintenance, issues } = Route.useLoaderData()
  const { t } = useI18n()
  const router = useRouter()
  useRealtimeInvalidate('vehicles')
  useRealtimeInvalidate('service_records')
  useRealtimeInvalidate('vehicle_issues')

  const [check, setCheck] = useState<{ vehicleId: string; mileage: number } | null>(null)

  const cards = useMemo(() => {
    return vehicles.map((v) => {
      const state = stateForVehicle({ vehicle: v, serviceRows: maintenance.rows, issues, rules: alertRules, documentTypes, t })
      const hv: HealthVehicle = {
        id: v.id,
        plate: v.plate,
        brand: v.brand,
        model: v.model,
        image_url: v.image_urls[0] ?? null,
        mileage: v.mileage_current,
      }
      return { hv, state }
    })
  }, [vehicles, maintenance.rows, issues, alertRules, documentTypes, t])

  // Worst-first so cars needing action lead.
  const sorted = useMemo(() => [...cards].sort((a, b) => a.state.scoreOverall - b.state.scoreOverall), [cards])

  const notRentable = cards.filter((c) => !isRentable(c.state.status)).length

  // Warm the image CDN (R2) handshake from the first photo we have — the grid is
  // photo-heavy, so the first byte arrives sooner.
  const imgOrigin = useMemo(() => {
    for (const v of vehicles) {
      const u = v.image_urls[0]
      if (u) {
        try {
          return new URL(u).origin
        } catch {
          /* ignore */
        }
      }
    }
    return null
  }, [vehicles])

  // Every block across the fleet — the day's real to-do list.
  const priorities = useMemo(() => {
    const items: { plate: string; vehicleId: string; label: string; action: string }[] = []
    for (const c of cards) {
      for (const b of c.state.blocks) {
        items.push({
          plate: c.hv.plate,
          vehicleId: c.hv.id,
          label: t(b.label.key, b.label.params),
          action: t(b.action.key, b.action.params),
        })
      }
    }
    return items.slice(0, 8)
  }, [cards, t])

  return (
    <div>
      {imgOrigin && <link rel="preconnect" href={imgOrigin} crossOrigin="" />}
      <PageHeader title={t('si.title')} subtitle={t('si.subtitle')} />

      {/* Today — only shown when something needs doing */}
      {priorities.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-faint)]">
            {t('si.today')} · {notRentable}
          </div>
          <ul className="p-1">
            {priorities.map((p, i) => (
              <li
                key={`${p.vehicleId}-${i}`}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--color-surface-muted)]"
                onClick={() => router.navigate({ to: '/suivi/$vehicleId', params: { vehicleId: p.vehicleId } })}
              >
                <PngIcon path="status/non-louable" size={20} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--color-ink)]">
                    <span className="font-mono text-xs text-[var(--color-faint)]">{p.plate}</span> · {p.label}
                  </div>
                  <div className="truncate text-xs text-[var(--color-muted)]">{p.action}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Health cards */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(({ hv, state }) => (
          <HealthCard key={hv.id} vehicle={hv} state={state} onQuickCheck={() => setCheck({ vehicleId: hv.id, mileage: hv.mileage })} />
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-[var(--color-faint)]">
        <a href="https://icons8.com" target="_blank" rel="noreferrer" className="hover:underline">
          Icons by Icons8
        </a>
      </p>

      {check && (
        <QuickCheckDialog
          open={!!check}
          onOpenChange={(o) => !o && setCheck(null)}
          vehicleId={check.vehicleId}
          defaultMileage={check.mileage}
          onDone={() => {
            setCheck(null)
            router.invalidate()
          }}
        />
      )}
    </div>
  )
}
