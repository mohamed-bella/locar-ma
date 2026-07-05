import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

// YouTube-style top progress bar during route/loader transitions.
export function TopProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    if (isLoading) {
      setVisible(true)
      setWidth(10)
      interval = setInterval(() => {
        setWidth((w) => Math.min(w + (90 - w) * 0.18, 90))
      }, 180)
    } else if (visible) {
      setWidth(100)
      timeout = setTimeout(() => {
        setVisible(false)
        setWidth(0)
      }, 260)
    }

    return () => {
      if (interval) clearInterval(interval)
      if (timeout) clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease' }}
    >
      <div
        className="h-full bg-[var(--color-brand)]"
        style={{
          width: `${width}%`,
          transition: 'width 0.2s ease',
          boxShadow: '0 0 10px rgba(250,90,40,0.6)',
        }}
      />
    </div>
  )
}
