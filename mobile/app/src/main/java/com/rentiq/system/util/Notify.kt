package com.rentiq.system.util

import android.util.Log
import com.rentiq.system.data.api.SupabaseClient

// Best-effort WhatsApp notification enqueue. The Baileys bot subscribes to the
// notification_queue table via Supabase Realtime and sends the message.
// Never throws — a failed notification must never break the user's action.
object Notify {
    suspend fun enqueue(agencyId: String?, type: String, payload: Map<String, Any?>): Boolean {
        if (agencyId.isNullOrBlank()) return false
        try {
            val res = SupabaseClient.rest.enqueueMobileNotification(
                mapOf(
                    "p_agency_id" to agencyId,
                    "p_type" to type,
                    "p_payload" to payload,
                )
            )
            if (!res.isSuccessful) {
                Log.w("Notify", "enqueue $type HTTP ${res.code()}")
                return false
            }
            return true
        } catch (e: Exception) {
            Log.w("Notify", "enqueue $type failed: ${e.message}")
            return false
        }
    }
}
