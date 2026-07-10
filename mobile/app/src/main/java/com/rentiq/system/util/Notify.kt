package com.rentiq.system.util

import android.util.Log
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.NotificationInsert

// Best-effort WhatsApp notification enqueue. The Baileys bot subscribes to the
// notification_queue table via Supabase Realtime and sends the message.
// Never throws — a failed notification must never break the user's action.
object Notify {
    suspend fun enqueue(agencyId: String?, type: String, payload: Map<String, Any?>) {
        if (agencyId.isNullOrBlank()) return
        try {
            val res = SupabaseClient.rest.createNotification(
                NotificationInsert(agencyId = agencyId, type = type, payload = payload)
            )
            if (!res.isSuccessful) {
                Log.w("Notify", "enqueue $type HTTP ${res.code()}")
            }
        } catch (e: Exception) {
            Log.w("Notify", "enqueue $type failed: ${e.message}")
        }
    }
}
