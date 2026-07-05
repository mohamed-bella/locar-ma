import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X, Star } from 'lucide-react'
import { toast } from 'sonner'
import { presignVehicleUploads } from '~/server/fleet'
import { useI18n } from '~/lib/i18n'

type Item = { key: string; url: string; uploading?: boolean }

// Uploads images straight to R2 (presigned PUT) and reports the object keys.
export function ImageUploader({
  initial = [],
  onChange,
}: {
  initial?: { key: string; url: string }[]
  onChange: (keys: string[]) => void
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<Item[]>(initial)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function emit(next: Item[]) {
    setItems(next)
    onChange(next.filter((i) => !i.uploading).map((i) => i.key))
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return

    setBusy(true)
    // optimistic local previews
    const pending: Item[] = list.map((f) => ({
      key: `pending:${crypto.randomUUID()}`,
      url: URL.createObjectURL(f),
      uploading: true,
    }))
    let current = [...items, ...pending]
    setItems(current)

    try {
      const signed = await presignVehicleUploads({
        data: { files: list.map((f) => ({ name: f.name, type: f.type })) },
      })
      await Promise.all(
        signed.map((s, i) =>
          fetch(s.url, {
            method: 'PUT',
            body: list[i],
            headers: { 'Content-Type': list[i].type },
          }).then((r) => {
            if (!r.ok) throw new Error(`Upload failed (${r.status})`)
          }),
        ),
      )
      // swap pending → real keys (keep local preview URL, still valid)
      current = current.map((it) => {
        const idx = pending.indexOf(it)
        return idx >= 0 ? { key: signed[idx].key, url: it.url } : it
      })
      emit(current)
    } catch (err: any) {
      toast.error(err?.message ?? t('img.uploadFailed'))
      emit(items) // roll back to previous good set
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remove(item: Item) {
    emit(items.filter((i) => i !== item))
  }

  function makeCover(item: Item) {
    emit([item, ...items.filter((i) => i !== item)])
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.key}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-muted)]"
          >
            <img src={it.url} alt="" className="h-full w-full object-cover" />
            {it.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-brand)]" />
              </div>
            ) : (
              <>
                {i === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--color-ink)]/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {t('img.cover')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeCover(it)}
                    title={t('img.setCover')}
                    className="absolute left-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(it)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--color-line-strong)] text-[var(--color-muted)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-xs font-medium">{t('img.addPhotos')}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  )
}
