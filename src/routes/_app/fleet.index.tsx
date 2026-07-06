import { useMemo, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Car, Plus, Search, Upload, MoreVertical, Eye, Pencil, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  listVehicles,
  createVehicle,
  updateVehicle,
  setVehicleStatus,
  type Vehicle,
} from '~/server/fleet'
import { listAlertRules, type AlertRule } from '~/server/alertRules'
import { listDocumentTypes } from '~/server/documentTypes'
import { VehicleForm } from '~/components/VehicleForm'
import { BulkImportVehicles } from '~/components/BulkImportVehicles'
import { DeleteVehicleDialog } from '~/components/DeleteVehicleDialog'
import { vehicleAlerts } from '~/lib/fleet'
import { brandColor } from '~/lib/brandColor'
import { VEHICLE_STATUSES } from '~/lib/schemas'
import { useRealtimeInvalidate } from '~/lib/useRealtime'
import { useI18n } from '~/lib/i18n'
import {
  Button,
  Badge,
  statusTone,
  Input,
  Select,
  EmptyState,
  PageHeader,
  SlideOver,
  Skeleton,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  cn,
} from '~/components/ui'

export const Route = createFileRoute('/_app/fleet/')({
  loader: async () => {
    const [vehicles, alertRules, documentTypes] = await Promise.all([
      listVehicles(),
      listAlertRules(),
      listDocumentTypes(),
    ])
    return { vehicles, alertRules, documentTypes }
  },
  component: Fleet,
  pendingComponent: FleetPending,
})

function Fleet() {
  const { vehicles, alertRules, documentTypes } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | (typeof VEHICLE_STATUSES)[number]>('all')
  const [brand, setBrand] = useState('all')

  useRealtimeInvalidate('vehicles')
  useRealtimeInvalidate('document_alert_rules')

  async function changeStatus(v: Vehicle, next: 'available' | 'maintenance') {
    try {
      await setVehicleStatus({ data: { id: v.id, status: next } })
      toast.success(t('fleet.statusSet', { status: t(`status.${next}`) }))
      await router.invalidate()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.actionFailed'))
    }
  }
  function copyPlate(v: Vehicle) {
    navigator.clipboard?.writeText(v.plate)
    toast.success(t('fleet.plateCopied'))
  }

  const dueCount = useMemo(() => vehicles.filter((v) => vehicleAlerts(v, alertRules).length > 0).length, [vehicles, alertRules])

  // Distinct brands present in the fleet, for the brand filter.
  const brands = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.brand).filter((b): b is string => !!b))).sort(),
    [vehicles],
  )

  // Per-status counts for the filter chips.
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of vehicles) c[v.status] = (c[v.status] ?? 0) + 1
    return c
  }, [vehicles])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (status !== 'all' && v.status !== status) return false
      if (brand !== 'all' && v.brand !== brand) return false
      if (q && ![v.plate, v.brand, v.model].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
      return true
    })
  }, [vehicles, query, status, brand])

  return (
    <div>
      <PageHeader
        title={t('fleet.title')}
        subtitle={
          <span className="flex items-center gap-2">
            {vehicles.length === 1
              ? t('fleet.vehicle', { n: vehicles.length })
              : t('fleet.vehicles', { n: vehicles.length })}
            {dueCount > 0 && (
              <Badge tone="danger" dot>
                {t('fleet.needAttention', { n: dueCount })}
              </Badge>
            )}
          </span>
        }
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="secondary" size="lg" className="flex-1 sm:flex-none" onClick={() => setImporting(true)}>
              <Upload className="h-[18px] w-[18px]" /> {t('fleet.importJson')}
            </Button>
            <Button size="lg" className="flex-1 sm:flex-none" onClick={() => setAdding(true)}>
              <Plus className="h-[18px] w-[18px]" /> {t('fleet.addVehicle')}
            </Button>
          </div>
        }
      />

      {vehicles.length > 0 && (
        <div className="mt-6 space-y-3">
          {/* Search + brand */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('fleet.searchPlaceholder')}
                className="w-full pl-10"
              />
            </div>
            {brands.length > 0 && (
              <div className="w-full sm:w-52">
                <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="all">{t('fleet.allBrands')}</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip active={status === 'all'} onClick={() => setStatus('all')} label={t('fleet.allStatus')} count={vehicles.length} />
            {VEHICLE_STATUSES.map((s) => (
              <StatusChip
                key={s}
                active={status === s}
                onClick={() => setStatus(s)}
                label={t(`status.${s}`)}
                count={statusCounts[s] ?? 0}
                tone={s}
              />
            ))}
          </div>
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
          <EmptyState
            icon={Car}
            title={t('fleet.emptyTitle')}
            description={t('fleet.emptyDesc')}
            action={
              <Button size="lg" onClick={() => setAdding(true)}>
                <Plus className="h-[18px] w-[18px]" /> {t('fleet.addVehicle')}
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-[var(--color-muted)]">
            {query ? t('fleet.noMatch', { q: query }) : t('fleet.noFilterMatch')}
          </p>
          <button
            onClick={() => {
              setQuery('')
              setStatus('all')
              setBrand('all')
            }}
            className="text-sm font-semibold text-[var(--color-brand)] hover:underline"
          >
            {t('fleet.clearFilters')}
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              rules={alertRules}
              onOpen={() => router.navigate({ to: '/fleet/$vehicleId', params: { vehicleId: v.id } })}
              onEdit={() => setEditing(v)}
              onDelete={() => setDeleting(v)}
              onStatus={(s) => changeStatus(v, s)}
              onCopyPlate={() => copyPlate(v)}
            />
          ))}
        </div>
      )}

      <SlideOver open={adding} onOpenChange={setAdding} title={t('fleet.addVehicle')} description={t('fleet.addVehicleDesc')}>
        <VehicleForm
          submitLabel={t('fleet.addVehicle')}
          documentTypes={documentTypes}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            await createVehicle({ data: values as any })
            setAdding(false)
            toast.success(t('fleet.vehicleAdded'))
            await router.invalidate()
          }}
        />
      </SlideOver>

      <BulkImportVehicles open={importing} onOpenChange={setImporting} onImported={() => router.invalidate()} />

      {deleting && (
        <DeleteVehicleDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          vehicleId={deleting.id}
          plate={deleting.plate}
          onDeleted={() => {
            setDeleting(null)
            router.invalidate()
          }}
        />
      )}

      <SlideOver
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `${t('common.edit')} · ${editing.plate}` : t('common.edit')}
        description={editing?.plate}
      >
        {editing && (
          <VehicleForm
            initial={editing}
            submitLabel={t('common.saveChanges')}
            documentTypes={documentTypes}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await updateVehicle({ data: { ...(values as any), id: editing.id } })
              setEditing(null)
              toast.success(t('fleet.vehicleUpdated'))
              await router.invalidate()
            }}
          />
        )}
      </SlideOver>
    </div>
  )
}

function StatusChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  tone?: (typeof VEHICLE_STATUSES)[number]
}) {
  const dot: Record<string, string> = {
    available: 'bg-[var(--color-ok)]',
    rented: 'bg-[var(--color-info)]',
    reserved: 'bg-amber-500',
    maintenance: 'bg-[var(--color-danger)]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          : 'border-[var(--color-line)] bg-white text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]',
      )}
    >
      {tone && <span className={cn('h-2 w-2 rounded-full', dot[tone])} />}
      {label}
      <span className={cn('tnum', active ? 'text-[var(--color-brand)]' : 'text-[var(--color-faint)]')}>{count}</span>
    </button>
  )
}

function VehicleCard({
  vehicle: v,
  rules,
  onOpen,
  onEdit,
  onDelete,
  onStatus,
  onCopyPlate,
}: {
  vehicle: Vehicle
  rules: AlertRule[]
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onStatus: (s: 'available' | 'maintenance') => void
  onCopyPlate: () => void
}) {
  const { t } = useI18n()
  const alerts = vehicleAlerts(v, rules)
  const title = [v.brand, v.model].filter(Boolean).join(' ') || t('res.vehicle')
  const band = brandColor(v.brand || v.model || v.plate)

  const STATUS_DOT: Record<string, string> = {
    available: 'bg-[var(--color-ok)]',
    rented: 'bg-[var(--color-info)]',
    reserved: 'bg-amber-500',
    maintenance: 'bg-[var(--color-danger)]',
  }

  return (
    <div className="skeu-card group relative flex flex-col overflow-hidden rounded-xl border border-[var(--color-line)] transition hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-pop)]">
      {/* Clickable surface → detail */}
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-ring)]"
      >
        <div className="relative aspect-[16/10] w-full select-none overflow-hidden bg-[var(--color-surface-muted)]">
          {v.image_urls[0] ? (
            <img src={v.image_urls[0]} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Car className="h-8 w-8 text-[var(--color-faint)]" />
            </div>
          )}

          <div className="absolute left-2 top-2">
            <Badge tone={statusTone(v.status)} dot className="bg-white/90 backdrop-blur">
              {t(`status.${v.status}`)}
            </Badge>
          </div>

          {alerts.length > 0 && (
            <span
              className="absolute bottom-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-danger)] px-1.5 text-[11px] font-bold text-white shadow"
              title={alerts
                .map((a) => `${a.label}: ${a.daysLeft < 0 ? t('vd.overdue', { n: -a.daysLeft }) : t('vd.daysLeft', { n: a.daysLeft })}`)
                .join(', ')}
            >
              {alerts.length}
            </span>
          )}
        </div>

        {/* Bold colored title band — gives every car a distinct identity */}
        <div
          className="flex items-center gap-2 px-3 py-2 min-w-0"
          style={{ backgroundColor: band }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-white/85"
            style={{ boxShadow: '0 0 0 3px rgba(255,255,255,0.18)' }}
          />
          <h3
            className="truncate text-xs sm:text-sm font-bold uppercase tracking-wide text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.25)] min-w-0"
            title={title}
          >
            {title}
          </h3>
        </div>

        {/* Info strip */}
        <div className="flex items-center justify-between gap-1.5 px-2.5 py-2.5 sm:px-3 sm:py-2.5 min-w-0">
          <span className="rounded border border-[var(--color-line)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[9px] sm:text-[11px] font-semibold text-[var(--color-ink-soft)] min-w-0 truncate">
            {v.plate}
          </span>
          <div className="shrink-0 text-right leading-tight min-w-0">
            <span className="text-xs sm:text-sm font-bold tnum text-[var(--color-ink)]">{v.daily_rate.toLocaleString()}</span>
            <span className="ml-0.5 sm:ml-1 text-[8px] sm:text-[10px] font-medium text-[var(--color-faint)]">MAD/{t('common.perDay')}</span>
          </div>
        </div>
      </button>

      {/* Kebab menu (overlays, above the clickable surface) */}
      <div className="absolute right-2 top-2">
        <Menu
          trigger={
            <button
              type="button"
              aria-label={t('common.actions')}
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] bg-white/90 text-[var(--color-muted)] shadow-sm backdrop-blur transition hover:text-[var(--color-ink)]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          }
        >
          <MenuItem icon={Eye} onSelect={onOpen}>
            {t('fleet.viewDetails')}
          </MenuItem>
          <MenuItem icon={Pencil} onSelect={onEdit}>
            {t('common.edit')}
          </MenuItem>
          <MenuItem icon={Copy} onSelect={onCopyPlate}>
            {t('fleet.copyPlate')}
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>{t('fleet.setStatus')}</MenuLabel>
          {(['available', 'maintenance'] as const)
            .filter((s) => s !== v.status)
            .map((s) => (
              <MenuItem
                key={s}
                icon={() => <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[s])} />}
                onSelect={() => onStatus(s)}
              >
                {t(`status.${s}`)}
              </MenuItem>
            ))}
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onSelect={onDelete}>
            {t('fleet.deleteVehicle')}
          </MenuItem>
        </Menu>
      </div>
    </div>
  )
}

function FleetPending() {
  const { t } = useI18n()
  return (
    <div>
      <PageHeader title={t('fleet.title')} subtitle={t('common.loading')} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white shadow-[var(--shadow-card)]">
            <Skeleton className="aspect-[16/10] rounded-none" />
            <div className="space-y-2.5 p-3">
              <Skeleton className="h-4.5 w-32" />
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-8" />
              </div>
              <div className="flex justify-between items-center mt-2.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="border-t border-[var(--color-line)] mt-3 pt-2.5">
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
