import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical, Grid3x3, Check, RotateCcw } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
import { cn } from '~/components/ui'

export type Widget = {
  id: string
  /** column span on the lg 3-col grid */
  span: 1 | 2 | 3
  node: React.ReactNode
}

// Static class map — Tailwind can't see dynamic `lg:col-span-${n}`.
const SPAN: Record<1 | 2 | 3, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
}

// A responsive dashboard grid whose cards the user can reorder by drag & drop.
// Order persists to localStorage. SSR-safe: starts from the given order, then
// hydrates saved order in an effect (no hydration mismatch).
export function WidgetGrid({ widgets, storageKey }: { widgets: Widget[]; storageKey: string }) {
  const { t } = useI18n()
  const defaultOrder = useMemo(() => widgets.map((w) => w.id), [widgets])
  const [order, setOrder] = useState<string[]>(defaultOrder)
  const [editing, setEditing] = useState(false)
  const [overId, setOverId] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)

  // Load saved order after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw) as string[]
        if (Array.isArray(saved)) setOrder(saved)
      }
    } catch {
      /* ignore */
    }
  }, [storageKey])

  // Effective order: saved ids that still exist + any new widgets appended.
  const ordered = useMemo(() => {
    const known = new Map(widgets.map((w) => [w.id, w]))
    const seen = new Set<string>()
    const out: Widget[] = []
    for (const id of order) {
      const w = known.get(id)
      if (w && !seen.has(id)) {
        out.push(w)
        seen.add(id)
      }
    }
    for (const w of widgets) if (!seen.has(w.id)) out.push(w)
    return out
  }, [order, widgets])

  function persist(next: string[]) {
    setOrder(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function move(from: string | null, to: string) {
    if (!from || from === to) return
    const ids = ordered.map((w) => w.id)
    const a = ids.indexOf(from)
    const b = ids.indexOf(to)
    if (a < 0 || b < 0) return
    const next = [...ids]
    next.splice(a, 1)
    next.splice(b, 0, from)
    persist(next)
  }

  function reset() {
    persist(defaultOrder)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {editing && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t('dash.resetLayout')}
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition',
            editing
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
              : 'border-[var(--color-line)] bg-white text-[var(--color-muted)] hover:text-[var(--color-ink)]',
          )}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Grid3x3 className="h-3.5 w-3.5" />}
          {editing ? t('dash.done') : t('dash.organize')}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {ordered.map((w) => (
          <div
            key={w.id}
            className={cn(SPAN[w.span], 'relative')}
            draggable={editing}
            onDragStart={(e) => {
              dragId.current = w.id
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', w.id)
            }}
            onDragOver={(e) => {
              if (!editing) return
              e.preventDefault()
              if (overId !== w.id) setOverId(w.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              move(dragId.current, w.id)
              setOverId(null)
            }}
            onDragEnd={() => {
              dragId.current = null
              setOverId(null)
            }}
          >
            <div
              className={cn(
                'h-full transition',
                editing && 'cursor-move rounded-[var(--radius-card)] ring-1 ring-dashed ring-[var(--color-line-strong)]',
                editing && overId === w.id && 'ring-2 ring-[var(--color-brand)]',
                dragId.current === w.id && 'opacity-50',
              )}
            >
              {/* Block inner interactions while organizing so links don't fire. */}
              <div className={cn('h-full', editing && 'pointer-events-none select-none')}>{w.node}</div>
              {editing && (
                <span className="absolute end-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-line)] bg-white text-[var(--color-muted)] shadow-[var(--shadow-card)]">
                  <GripVertical className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
