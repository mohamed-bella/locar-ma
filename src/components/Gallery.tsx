import { useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { Grid3x3, ImageOff } from 'lucide-react'
import { useI18n } from '~/lib/i18n'

// Airbnb-style photo grid: one hero + a 2×2 cluster, with a lightbox for the rest.
export function Gallery({ urls }: { urls: string[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  function openAt(i: number) {
    setIndex(i)
    setOpen(true)
  }

  if (urls.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] text-[var(--color-faint)]">
        <ImageOff className="mr-2 h-5 w-5" /> {t('img.noPhotos')}
      </div>
    )
  }

  const cluster = urls.slice(1, 5)

  return (
    <>
      {/* Mobile: single hero */}
      <button
        type="button"
        onClick={() => openAt(0)}
        className="relative block aspect-[16/10] w-full overflow-hidden rounded-2xl sm:hidden"
      >
        <img src={urls[0]} alt="" className="h-full w-full object-cover" />
        {urls.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            1 / {urls.length}
          </span>
        )}
      </button>

      {/* Desktop: Airbnb grid */}
      <div className="relative hidden grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:grid sm:h-[360px]">
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group relative col-span-2 row-span-2 overflow-hidden"
        >
          <img
            src={urls[0]}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:brightness-95"
          />
        </button>
        {cluster.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => openAt(i + 1)}
            className="group relative overflow-hidden"
          >
            <img
              src={u}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:brightness-95"
            />
          </button>
        ))}
        {/* fill empty cells so the grid keeps its shape */}
        {Array.from({ length: Math.max(0, 4 - cluster.length) }).map((_, i) => (
          <div key={`e${i}`} className="bg-[var(--color-surface-muted)]" />
        ))}

        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-ink)]/10 bg-white/95 px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] shadow-sm backdrop-blur hover:bg-white"
        >
          <Grid3x3 className="h-4 w-4" /> {t('img.showAll')}
        </button>
      </div>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={urls.map((src) => ({ src }))}
        on={{ view: ({ index: i }) => setIndex(i) }}
      />
    </>
  )
}
