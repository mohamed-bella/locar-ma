import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createBrand, presignBrandLogo, type Brand } from '~/server/brands'
import { Modal, Button, Field, Input } from '~/components/ui'
import { useI18n } from '~/lib/i18n'

// Add a brand to the shared catalog. Available to every agency once created.
export function AddBrandDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
  onCreated: (brand: Brand) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(defaultName ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pick(f: File | null) {
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      let logoKey: string | undefined
      if (file) {
        const signed = await presignBrandLogo({ data: { name: file.name, type: file.type, size: file.size } })
        const res = await fetch(signed.url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!res.ok) throw new Error(`Logo upload failed (${res.status})`)
        logoKey = signed.key
      }
      const brand = await createBrand({ data: { name: name.trim(), logo_key: logoKey } })
      toast.success(t('brand.added', { name: brand.name }))
      onCreated(brand)
      onOpenChange(false)
      setName('')
      pick(null)
    } catch (err: any) {
      toast.error(err?.message ?? t('brand.couldNotAdd'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('brand.add')}
      description={t('brand.sharedDesc')}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] text-[var(--color-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
          >
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
          </button>
          <div className="text-sm text-[var(--color-muted)]">
            {t('brand.logoOptional')}
            <div className="text-xs text-[var(--color-faint)]">{t('brand.logoHint')}</div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        <Field label={t('brand.nameLabel')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dacia" autoFocus />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('brand.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
