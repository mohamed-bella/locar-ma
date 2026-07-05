import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Plus, Search, Tag } from 'lucide-react'
import { listBrands, type Brand } from '~/server/brands'
import { AddBrandDialog } from '~/components/AddBrandDialog'
import { fieldCls, cn } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

function Logo({ url, size = 20 }: { url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size }} className="rounded object-contain" />
  ) : (
    <span
      className="flex items-center justify-center rounded bg-[var(--color-surface-muted)] text-[var(--color-faint)]"
      style={{ width: size, height: size }}
    >
      <Tag style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  )
}

// Searchable brand picker with logos + inline "add brand".
// Emits hidden inputs `brand_id` and `brand` (name) for the surrounding form.
export function BrandSelect({
  initialId,
  initialName,
  initialLogoUrl,
}: {
  initialId?: string | null
  initialName?: string | null
  initialLogoUrl?: string | null
}) {
  const { t } = useI18n()
  const [brands, setBrands] = useState<Brand[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string; logo_url: string | null } | null>(
    initialId && initialName ? { id: initialId, name: initialName, logo_url: initialLogoUrl ?? null } : null,
  )
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')

  async function refresh() {
    try {
      setBrands(await listBrands())
    } catch {
      /* surfaced elsewhere */
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className={cn(fieldCls, 'flex items-center justify-between')}>
            <span className="flex items-center gap-2 truncate">
              {selected ? (
                <>
                  <Logo url={selected.logo_url} />
                  <span className="truncate text-[var(--color-ink)]">{selected.name}</span>
                </>
              ) : (
                <span className="text-[var(--color-faint)]">{t('brand.select')}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--color-faint)]" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[16rem] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-pop)]"
          >
            <Command shouldFilter>
              <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3">
                <Search className="h-4 w-4 text-[var(--color-faint)]" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder={t('brand.search')}
                  className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1.5">
                <Command.Empty className="px-2 py-6 text-center text-sm text-[var(--color-muted)]">
                  {t('brand.noneFound')}
                </Command.Empty>
                {brands.map((b) => (
                  <Command.Item
                    key={b.id}
                    value={b.name}
                    onSelect={() => {
                      setSelected({ id: b.id, name: b.name, logo_url: b.logo_url })
                      setOpen(false)
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-[var(--color-surface-muted)]"
                  >
                    <Logo url={b.logo_url} size={24} />
                    <span className="flex-1 truncate text-[var(--color-ink)]">{b.name}</span>
                    {selected?.id === b.id && <Check className="h-4 w-4 text-[var(--color-brand)]" />}
                  </Command.Item>
                ))}
              </Command.List>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setAddOpen(true)
                }}
                className="flex w-full items-center gap-2 border-t border-[var(--color-line)] px-3 py-2.5 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]"
              >
                <Plus className="h-4 w-4" />
                {t('brand.addWord')} {query ? `"${query}"` : t('brand.addNew')}
              </button>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Values for the surrounding form */}
      <input type="hidden" name="brand_id" value={selected?.id ?? ''} />
      <input type="hidden" name="brand" value={selected?.name ?? ''} />

      <AddBrandDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultName={query}
        onCreated={(brand) => {
          setBrands((prev) => [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)))
          setSelected({ id: brand.id, name: brand.name, logo_url: brand.logo_url })
        }}
      />
    </>
  )
}
