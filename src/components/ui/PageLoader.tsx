import { useEffect, useRef, useState } from 'react'

// Clever route-loading indicator: an animated circular ring that counts 0→100%.
// Real progress is unknowable (a loader either resolves or doesn't), so we ease
// toward ~92% with a decelerating curve while pending; when the data lands the
// component unmounts — which reads as "done". A short-lived route snaps near 100
// almost instantly, a slow one crawls — both feel honest.
export function PageLoader({ label }: { label?: string }) {
  const [pct, setPct] = useState(0)
  const raf = useRef<number | undefined>(undefined)
  const start = useRef<number>(0)

  useEffect(() => {
    start.current = performance.now()
    const tick = (now: number) => {
      const t = (now - start.current) / 1000 // seconds elapsed
      // Decelerating approach to 92: fast at first, asymptotic after.
      const next = 92 * (1 - Math.exp(-t * 1.1))
      setPct(next)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  const R = 46
  const C = 2 * Math.PI * R
  const offset = C * (1 - pct / 100)
  const rounded = Math.round(pct)

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-5">
      <div className="relative h-[120px] w-[120px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="pl-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand)" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.55" />
            </linearGradient>
            <filter id="pl-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* track */}
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line)" strokeWidth="8" />
          {/* progress */}
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="url(#pl-grad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            filter="url(#pl-glow)"
            style={{ transition: 'stroke-dashoffset 0.15s linear' }}
          />
        </svg>

        {/* counting number — upright (undo the -rotate-90) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="tabular-nums text-2xl font-bold text-[var(--color-ink)]">
            {rounded}
            <span className="text-sm font-semibold text-[var(--color-muted)]">%</span>
          </span>
        </div>

        {/* subtle orbiting dot */}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]"
          style={{
            transform: `rotate(${(pct / 100) * 360 - 90}deg) translateX(46px)`,
            transformOrigin: '0 0',
            boxShadow: '0 0 8px var(--color-brand)',
            transition: 'transform 0.15s linear',
          }}
        />
      </div>

      <span className="text-sm font-medium text-[var(--color-muted)]">{label ?? 'Chargement…'}</span>
    </div>
  )
}
