import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Square's variable-width Bézier signature algorithm (same idea as signature_pad):
// each pointer sample carries a timestamp; velocity = distance / time drives the
// stroke width (faster = thinner, like a real pen), smoothed by a velocity filter.
// Points are joined with quadratic Béziers through their midpoints for smoothness.
// Zero dependencies — draws straight to a <canvas>.

type Point = { x: number; y: number; t: number }

export type SignaturePadHandle = {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: () => string | null // trimmed PNG, or null if empty
}

const VELOCITY_FILTER = 0.7
const MIN_W = 0.8
const MAX_W = 3.2

export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (empty: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const drawing = useRef(false)
    const points = useRef<Point[]>([])
    const lastVelocity = useRef(0)
    const lastWidth = useRef((MIN_W + MAX_W) / 2)
    const dirty = useRef(false)
    const [empty, setEmpty] = useState(true)

    // High-DPI backing store so strokes stay crisp on phones.
    function setup() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const ctx = canvas.getContext('2d')!
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.fillStyle = '#0f172a'
      ctx.strokeStyle = '#0f172a'
      ctxRef.current = ctx
    }

    useEffect(() => {
      setup()
      const onResize = () => {
        // Preserve nothing on resize — signature restarts (rare on a locked page).
        setup()
        points.current = []
        dirty.current = false
        setEmpty(true)
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function pos(evt: PointerEvent): Point {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top, t: performance.now() }
    }

    function strokeWidth(velocity: number) {
      // Higher velocity → thinner stroke.
      const w = Math.max(MAX_W / (velocity + 1), MIN_W)
      return Math.min(w, MAX_W)
    }

    // Draw a dot (for taps) or a variable-width segment between the last points.
    function addPoint(p: Point) {
      const pts = points.current
      pts.push(p)
      if (pts.length < 3) return
      const ctx = ctxRef.current!

      const [p0, p1, p2] = pts.slice(-3)
      // midpoints for quadratic smoothing
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
      const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const dt = Math.max(p2.t - p1.t, 1)
      const velocity = VELOCITY_FILTER * (dist / dt) + (1 - VELOCITY_FILTER) * lastVelocity.current
      lastVelocity.current = velocity
      const targetW = strokeWidth(velocity)
      const width = lastWidth.current + (targetW - lastWidth.current) * 0.4
      lastWidth.current = width

      ctx.beginPath()
      ctx.lineWidth = width
      ctx.moveTo(m1.x, m1.y)
      ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y)
      ctx.stroke()
    }

    function down(evt: PointerEvent) {
      evt.preventDefault()
      canvasRef.current!.setPointerCapture(evt.pointerId)
      drawing.current = true
      points.current = []
      lastVelocity.current = 0
      lastWidth.current = (MIN_W + MAX_W) / 2
      const p = pos(evt)
      points.current.push(p)
      // initial dot so a tap leaves a mark
      const ctx = ctxRef.current!
      ctx.beginPath()
      ctx.arc(p.x, p.y, lastWidth.current / 2, 0, Math.PI * 2)
      ctx.fill()
      if (empty) {
        setEmpty(false)
        onChange?.(false)
      }
      dirty.current = true
    }
    function move(evt: PointerEvent) {
      if (!drawing.current) return
      evt.preventDefault()
      // coalesced events = smoother strokes on high-rate touchscreens
      const events = (evt as any).getCoalescedEvents?.() ?? [evt]
      for (const e of events) addPoint(pos(e))
    }
    function up(evt: PointerEvent) {
      if (!drawing.current) return
      drawing.current = false
      try {
        canvasRef.current!.releasePointerCapture(evt.pointerId)
      } catch {
        /* ignore */
      }
    }

    useEffect(() => {
      const canvas = canvasRef.current!
      canvas.addEventListener('pointerdown', down)
      canvas.addEventListener('pointermove', move)
      canvas.addEventListener('pointerup', up)
      canvas.addEventListener('pointerleave', up)
      return () => {
        canvas.removeEventListener('pointerdown', down)
        canvas.removeEventListener('pointermove', move)
        canvas.removeEventListener('pointerup', up)
        canvas.removeEventListener('pointerleave', up)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empty])

    function clear() {
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      points.current = []
      dirty.current = false
      setEmpty(true)
      onChange?.(true)
    }

    // Trim whitespace → tight PNG of just the ink.
    function toDataURL(): string | null {
      const canvas = canvasRef.current
      if (!canvas || !dirty.current) return null
      const ctx = ctxRef.current!
      const { width, height } = canvas
      const img = ctx.getImageData(0, 0, width, height).data
      let minX = width, minY = height, maxX = 0, maxY = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (img[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX <= minX || maxY <= minY) return null
      const pad = 8
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
      maxX = Math.min(width, maxX + pad); maxY = Math.min(height, maxY + pad)
      const w = maxX - minX, h = maxY - minY
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h)
      return out.toDataURL('image/png')
    }

    useImperativeHandle(ref, () => ({ clear, isEmpty: () => empty, toDataURL }))

    return (
      <canvas
        ref={canvasRef}
        className="h-48 w-full touch-none rounded-2xl border-2 border-dashed border-[var(--color-line-strong)] bg-white"
        style={{ touchAction: 'none' }}
      />
    )
  },
)
