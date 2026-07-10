package com.rentiq.system.ui.signature

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class SignatureView @JvmOverloads constructor(
    ctx: Context, attrs: AttributeSet? = null
) : View(ctx, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = 4f
    }

    private data class Point(val x: Float, val y: Float, val time: Long)

    private val strokes = mutableListOf<MutableList<Point>>()
    private val drawPath = Path()
    private var lastVelocity = 0f

    private companion object {
        const val MIN_W = 2.4f
        const val MAX_W = 6.5f
        const val VELOCITY_FILTER = 0.7f
    }

    override fun onDraw(canvas: Canvas) {
        for (stroke in strokes) {
            if (stroke.size < 2) continue
            for (i in 1 until stroke.size) {
                val p0 = stroke[i - 1]
                val p1 = stroke[i]
                val dt = (p1.time - p0.time).coerceAtLeast(1)
                val dx = p1.x - p0.x
                val dy = p1.y - p0.y
                val velocity = Math.sqrt((dx * dx + dy * dy).toDouble()).toFloat() / dt
                val filtered = VELOCITY_FILTER * velocity + (1 - VELOCITY_FILTER) * lastVelocity
                lastVelocity = filtered
                val w = MAX_W - (MAX_W - MIN_W) * (filtered / (filtered + 1f))
                paint.strokeWidth = w.coerceIn(MIN_W, MAX_W)
                canvas.drawLine(p0.x, p0.y, p1.x, p1.y, paint)
            }
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                strokes.add(mutableListOf(Point(event.x, event.y, System.currentTimeMillis())))
                lastVelocity = 0f
                invalidate()
                parent.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                strokes.lastOrNull()?.add(Point(event.x, event.y, System.currentTimeMillis()))
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP -> {
                strokes.lastOrNull()?.add(Point(event.x, event.y, System.currentTimeMillis()))
                invalidate()
                parent.requestDisallowInterceptTouchEvent(false)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    fun clear() {
        strokes.clear()
        lastVelocity = 0f
        invalidate()
    }

    fun isEmpty(): Boolean = strokes.all { it.size < 2 }

    fun getSignatureBitmap(): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.WHITE)
        draw(c)
        return bmp
    }
}
