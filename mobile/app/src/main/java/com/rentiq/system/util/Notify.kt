package com.rentiq.system.util

import android.util.Log
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.NotificationInsert

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
                val error = runCatching { res.errorBody()?.string() }.getOrNull()
                Log.w("Notify", "enqueue RPC $type HTTP ${res.code()}: $error")
                return enqueueDirect(agencyId, type, payload)
            }
            return true
        } catch (e: Exception) {
            Log.w("Notify", "enqueue $type failed: ${e.message}")
            return enqueueDirect(agencyId, type, payload)
        }
    }

    private suspend fun enqueueDirect(agencyId: String, type: String, payload: Map<String, Any?>): Boolean {
        return try {
            val res = SupabaseClient.rest.createNotification(
                NotificationInsert(
                    agencyId = agencyId,
                    type = type,
                    payload = payload,
                )
            )
            if (!res.isSuccessful) {
                val error = runCatching { res.errorBody()?.string() }.getOrNull()
                Log.w("Notify", "enqueue direct $type HTTP ${res.code()}: $error")
                false
            } else {
                true
            }
        } catch (e: Exception) {
            Log.w("Notify", "enqueue direct $type failed: ${e.message}")
            false
        }
    }
}
