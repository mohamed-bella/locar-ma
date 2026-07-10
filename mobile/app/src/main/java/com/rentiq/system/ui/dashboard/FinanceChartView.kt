package com.rentiq.system.ui.dashboard

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.rentiq.system.R

class FinanceChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private val values = mutableListOf<Double>()
    private val labels = mutableListOf<String>()

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ContextCompat.getColor(context, R.color.blue_action)
    }
    private val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ContextCompat.getColor(context, R.color.muted)
        textSize = 24f
        textAlign = Paint.Align.CENTER
    }
    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ContextCompat.getColor(context, R.color.divider)
        strokeWidth = 2f
    }

    fun submit(data: List<Pair<String, Double>>) {
        labels.clear()
        values.clear()
        data.forEach {
            labels += it.first
            values += it.second.coerceAtLeast(0.0)
        }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val count = values.size
        if (count == 0) {
            canvas.drawText("Aucune donnée finance", width / 2f, height / 2f, mutedPaint)
            return
        }

        val left = paddingLeft + 12f
        val right = width - paddingRight - 12f
        val top = paddingTop + 18f
        val bottom = height - paddingBottom - 36f
        val chartHeight = (bottom - top).coerceAtLeast(1f)
        val max = values.maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
        val slot = (right - left) / count
        val barWidth = slot * 0.56f

        canvas.drawLine(left, bottom, right, bottom, gridPaint)
        values.forEachIndexed { index, raw ->
            val cx = left + slot * index + slot / 2f
            val h = (raw / max * chartHeight).toFloat()
            val barLeft = cx - barWidth / 2f
            val barRight = cx + barWidth / 2f
            canvas.drawRoundRect(barLeft, bottom - h, barRight, bottom, 12f, 12f, barPaint)
            canvas.drawText(labels.getOrElse(index) { "" }, cx, height - 10f, mutedPaint)
        }
    }
}
