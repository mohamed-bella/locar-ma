package com.rentiq.system.util

import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.ui.auth.LoginActivity

object AuthSession {
    fun isAuthError(code: Int): Boolean = code == 401 || code == 403

    fun messageFor(code: Int): String = when (code) {
        401, 403 -> "Session expiree. Reconnectez-vous."
        else -> "Erreur $code"
    }

    suspend fun ensureAgencyId(context: Context, showMessage: Boolean = true): String? {
        val session = SessionManager(context.applicationContext)
        session.agencyId?.takeIf { it.isNotBlank() }?.let { return it }

        val res = SupabaseClient.rest.getMembers()
        if (isAuthError(res.code())) {
            returnToLogin(context, showMessage)
            return null
        }
        if (!res.isSuccessful) {
            if (showMessage) {
                Toast.makeText(context, messageFor(res.code()), Toast.LENGTH_LONG).show()
            }
            return null
        }

        val agencyId = res.body()?.firstOrNull { it.agencyId.isNotBlank() }?.agencyId
        if (agencyId.isNullOrBlank()) {
            if (showMessage) {
                Toast.makeText(context, "Aucune agence liee a ce compte.", Toast.LENGTH_LONG).show()
            }
            return null
        }

        session.agencyId = agencyId
        return agencyId
    }

    fun returnToLogin(context: Context, showMessage: Boolean = true) {
        val appContext = context.applicationContext
        SessionManager(appContext).clear()
        SupabaseClient.accessToken = null
        if (showMessage) {
            Toast.makeText(context, "Session expiree. Reconnectez-vous.", Toast.LENGTH_LONG).show()
        }
        context.startActivity(
            Intent(context, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
        )
    }
}
