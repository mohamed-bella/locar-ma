package com.rentiq.system.util

import android.content.Context
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.rentiq.system.R

// Builds a single-select row of pill filters into a horizontal LinearLayout.
// Each option has a label + a value; selecting one fires onSelect(value).
object FilterPills {

    data class Option(val label: String, val value: String?)

    fun build(
        context: Context,
        container: LinearLayout,
        options: List<Option>,
        selectedValue: String?,
        counts: Map<String?, Int>? = null,
        onSelect: (String?) -> Unit,
    ) {
        container.removeAllViews()
        val pills = mutableListOf<TextView>()
        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        options.forEachIndexed { index, opt ->
            val pill = TextView(context).apply {
                text = counts?.let { "${opt.label}  ${it[opt.value] ?: 0}" } ?: opt.label
                textSize = 13f
                gravity = Gravity.CENTER
                setBackgroundResource(R.drawable.pill_bg)
                setPadding(dp(16), dp(8), dp(16), dp(8))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                if (index < options.size - 1) lp.marginEnd = dp(8)
                layoutParams = lp
                isClickable = true
                isFocusable = true
            }
            pills.add(pill)
            pill.setOnClickListener {
                pills.forEach { style(it, false) }
                style(pill, true)
                onSelect(opt.value)
            }
            container.addView(pill)
        }

        // Apply initial selection styling.
        options.forEachIndexed { i, opt -> style(pills[i], opt.value == selectedValue) }
    }

    private fun style(pill: TextView, selected: Boolean) {
        val ctx = pill.context
        if (selected) {
            pill.backgroundTintList = ContextCompat.getColorStateList(ctx, R.color.navy)
            pill.setTextColor(ContextCompat.getColor(ctx, R.color.white))
            pill.setTypeface(null, android.graphics.Typeface.BOLD)
        } else {
            pill.backgroundTintList = ContextCompat.getColorStateList(ctx, R.color.card_bg)
            pill.setTextColor(ContextCompat.getColor(ctx, R.color.muted))
            pill.setTypeface(null, android.graphics.Typeface.NORMAL)
        }
    }
}
