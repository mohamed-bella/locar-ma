import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Plus, Search, User } from 'lucide-react'
import { listClients, type Client } from '~/server/clients'
import { AddClientDialog } from '~/components/AddClientDialog'
import { fieldCls, cn } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

// Client picker with search + inline create. Emits hidden `client_id`.
export function ClientSelect({
  initialId,
  initialName,
}: {
  initialId?: string | null
  initialName?: string | null
}) {
  const { t } = useI18n()
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    initialId && initialName ? { id: initialId, name: initialName } : null,
  )
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')

  async function refresh() {
    try {
      setClients(await listClients())
    } catch {
      /* ignore */
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
              <User className="h-4 w-4 text-[var(--color-faint)]" />
              {selected ? (
                <span className="truncate text-[var(--color-ink)]">{selected.name}</span>
              ) : (
                <span className="text-[var(--color-faint)]">{t('cli.selectOptional')}</span>
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
                  placeholder={t('cli.searchClients')}
                  className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1.5">
                <Command.Empty className="px-2 py-6 text-center text-sm text-[var(--color-muted)]">
                  {t('cli.noneFound')}
                </Command.Empty>
                {selected && (
                  <Command.Item
                    value="__clear__ none"
                    onSelect={() => {
                      setSelected(null)
                      setOpen(false)
                    }}
                    className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-[var(--color-muted)] data-[selected=true]:bg-[var(--color-surface-muted)]"
                  >
                    {t('cli.clearSelection')}
                  </Command.Item>
                )}
                {clients.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.full_name} ${c.phone ?? ''} ${c.cin_passport ?? ''}`}
                    onSelect={() => {
                      setSelected({ id: c.id, name: c.full_name })
                      setOpen(false)
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-[var(--color-surface-muted)]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-xs font-semibold text-[var(--color-muted)]">
                      {c.full_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--color-ink)]">{c.full_name}</span>
                      {c.phone && <span className="block truncate text-xs text-[var(--color-faint)]">{c.phone}</span>}
                    </span>
                    {selected?.id === c.id && <Check className="h-4 w-4 text-[var(--color-brand)]" />}
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
                {t('cli.newClient')}{query ? `: "${query}"` : ''}
              </button>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <input type="hidden" name="client_id" value={selected?.id ?? ''} />

      <AddClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultName={query}
        onCreated={(client) => {
          setClients((prev) => [...prev, client].sort((a, b) => a.full_name.localeCompare(b.full_name)))
          setSelected({ id: client.id, name: client.full_name })
        }}
      />
    </>
  )
}
