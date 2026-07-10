package com.rentiq.system.util

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import com.rentiq.system.R
import java.util.concurrent.atomic.AtomicInteger

object NotificationHelper {
    const val CHANNEL_EVENTS = "rentiq_events"
    const val CHANNEL_SERVICE = "rentiq_service"
    const val SERVICE_NOTIF_ID = 1

    private val nextId = AtomicInteger(2000)

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()

        val events = NotificationChannel(
            CHANNEL_EVENTS,
            "Evenements Rentiq",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alertes operations: reservations, contrats, suivi, vehicules"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 100, 250)
            setSound(sound, attrs)
        }
        val service = NotificationChannel(
            CHANNEL_SERVICE,
            "Service temps reel",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Connexion Supabase Realtime en arriere-plan"
        }
        nm.createNotificationChannel(events)
        nm.createNotificationChannel(service)
    }

    fun notify(ctx: Context, title: String, body: String, clickIntent: Intent? = null) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val id = nextId.getAndIncrement()
        val pi = clickIntent?.let {
            PendingIntent.getActivity(ctx, id, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = NotificationCompat.Builder(ctx, CHANNEL_EVENTS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
        nm.notify(id, notification)
    }

    fun buildServiceNotification(ctx: Context): Notification =
        NotificationCompat.Builder(ctx, CHANNEL_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Rentiq")
            .setContentText("Notifications temps reel actives")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
}
