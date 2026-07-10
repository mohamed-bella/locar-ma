package com.rentiq.system.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.rentiq.system.R
import com.rentiq.system.ui.main.MainActivity

class DashboardWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { updateWidget(context, manager, it) }
    }

    companion object {
        private const val PREFS = "dashboard_widget"

        fun saveStats(
            context: Context,
            agencyName: String,
            monthRevenue: Double,
            pickups: Int,
            returns: Int,
            available: Int,
            rented: Int,
        ) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("agency_name", agencyName)
                .putInt("month_revenue", monthRevenue.toInt())
                .putInt("pickups", pickups)
                .putInt("returns", returns)
                .putInt("available", available)
                .putInt("rented", rented)
                .apply()
            refreshAll(context)
        }

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, DashboardWidgetProvider::class.java))
            ids.forEach { updateWidget(context, manager, it) }
        }

        private fun updateWidget(context: Context, manager: AppWidgetManager, id: Int) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_dashboard)
            views.setTextViewText(R.id.agencyName, prefs.getString("agency_name", "Agence"))
            views.setTextViewText(R.id.monthRevenue, "${prefs.getInt("month_revenue", 0)} DH")
            views.setTextViewText(R.id.operations, "Departs ${prefs.getInt("pickups", 0)} - Retours ${prefs.getInt("returns", 0)}")
            views.setTextViewText(R.id.fleet, "Disponibles ${prefs.getInt("available", 0)} - Louees ${prefs.getInt("rented", 0)}")

            val target = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widgetRoot, target)
            manager.updateAppWidget(id, views)
        }
    }
}
