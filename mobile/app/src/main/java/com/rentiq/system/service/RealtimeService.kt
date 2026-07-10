package com.rentiq.system.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.rentiq.system.BuildConfig
import com.rentiq.system.util.NotificationHelper
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RealtimeService : Service() {

    companion object {
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val PREF_FILE = "notif_prefs"
        const val KEY_ENABLED = "notif_enabled"
        const val KEY_RESERVATIONS = "notif_reservations"
        const val KEY_SIGNATURES = "notif_signatures"
        const val KEY_CONTRACTS = "notif_contracts"
        const val KEY_VEHICLES = "notif_vehicles"
        const val KEY_SUIVI = "notif_suivi"
        const val KEY_ISSUES = "notif_issues"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var ws: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var refCounter = 1

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createChannels(this)
        startForeground(NotificationHelper.SERVICE_NOTIF_ID, NotificationHelper.buildServiceNotification(this))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            disconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        if (!getSharedPreferences(PREF_FILE, MODE_PRIVATE).getBoolean(KEY_ENABLED, true)) {
            disconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        connect()
        return START_STICKY
    }

    private fun connect() {
        if (ws != null) return
        val session = SessionManager(this)
        val agencyId = session.agencyId ?: return
        val token = session.accessToken ?: return

        val wsUrl = BuildConfig.SUPABASE_URL
            .replace("https://", "wss://")
            .replace("http://", "ws://") +
            "/realtime/v1/websocket?apikey=${BuildConfig.SUPABASE_ANON_KEY}&vsn=1.0.0"

        val request = Request.Builder()
            .url(wsUrl)
            .addHeader("Authorization", "Bearer $token")
            .build()

        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                joinTable(webSocket, "res_$agencyId", "reservations", "INSERT", "agency_id=eq.$agencyId", token)
                joinTable(webSocket, "con_$agencyId", "contracts", "UPDATE", "agency_id=eq.$agencyId", token)
                joinTable(webSocket, "veh_$agencyId", "vehicles", "INSERT", "agency_id=eq.$agencyId", token)
                joinTable(webSocket, "svc_$agencyId", "service_records", "INSERT", "agency_id=eq.$agencyId", token)
                joinTable(webSocket, "iss_$agencyId", "vehicle_issues", "INSERT", "agency_id=eq.$agencyId", token)
                startHeartbeat(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                heartbeatJob?.cancel()
                ws = null
                scope.launch {
                    delay(30_000)
                    connect()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                heartbeatJob?.cancel()
                ws = null
            }
        })
    }

    private fun joinTable(ws: WebSocket, channel: String, table: String, event: String, filter: String, token: String) {
        val r = refCounter++
        val msg = """{"topic":"realtime:$channel","event":"phx_join","payload":{"config":{"broadcast":{"ack":false,"self":false},"presence":{"key":""},"postgres_changes":[{"event":"$event","schema":"public","table":"$table","filter":"$filter"}]},"access_token":"$token"},"ref":"$r"}"""
        ws.send(msg)
    }

    private fun startHeartbeat(ws: WebSocket) {
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(25_000)
                ws.send("""{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"hb"}""")
            }
        }
    }

    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            if (json.optString("event") != "postgres_changes") return
            val payload = json.optJSONObject("payload") ?: return
            val data = payload.optJSONObject("data") ?: return
            val type = data.optString("type")
            val table = data.optString("table")
            val record = data.optJSONObject("record") ?: return
            val oldRecord = data.optJSONObject("old_record")
            val prefs = getSharedPreferences(PREF_FILE, MODE_PRIVATE)

            when {
                table == "reservations" && type == "INSERT" && prefs.getBoolean(KEY_RESERVATIONS, true) -> {
                    NotificationHelper.notify(this, "Nouvelle reservation", "Une nouvelle reservation a ete creee")
                }
                table == "contracts" && type == "UPDATE" -> {
                    handleContractUpdate(record, oldRecord, prefs)
                }
                table == "vehicles" && type == "INSERT" && prefs.getBoolean(KEY_VEHICLES, true) -> {
                    val plate = record.optString("plate", "")
                    NotificationHelper.notify(this, "Nouveau vehicule", "Vehicule ${plate.ifBlank { "" }} ajoute a la flotte")
                }
                table == "service_records" && type == "INSERT" && prefs.getBoolean(KEY_SUIVI, true) -> {
                    val serviceType = record.optString("type", "")
                    val odometer = record.optString("odometer_km", "")
                    NotificationHelper.notify(this, "Suivi enregistre", "${serviceType.ifBlank { "Service" }} ${odometer.ifBlank { "" }}")
                }
                table == "vehicle_issues" && type == "INSERT" && prefs.getBoolean(KEY_ISSUES, true) -> {
                    val title = record.optString("title", "")
                    val severity = record.optString("severity", "")
                    NotificationHelper.notify(this, "Probleme vehicule", "${title.ifBlank { "Nouveau signalement" }} ${severity.ifBlank { "" }}")
                }
            }
        } catch (_: Exception) {
            // Realtime messages should never crash the foreground service.
        }
    }

    private fun handleContractUpdate(
        record: JSONObject,
        oldRecord: JSONObject?,
        prefs: android.content.SharedPreferences,
    ) {
        val shortId = record.optString("short_id", "")
        val signedAt = record.optString("signed_at", "")
        val justSigned = signedAt.isNotBlank() && oldRecord?.optString("signed_at", "")?.isNotBlank() != true
        if (justSigned && prefs.getBoolean(KEY_SIGNATURES, true)) {
            NotificationHelper.notify(this, "Contrat signe", "Contrat ${shortId.ifBlank { "" }} signe par le client")
        }

        val closedAt = record.optString("closed_at", "")
        val justClosed = closedAt.isNotBlank() && oldRecord?.optString("closed_at", "")?.isNotBlank() != true
        if (justClosed && prefs.getBoolean(KEY_CONTRACTS, true)) {
            NotificationHelper.notify(this, "Contrat cloture", "La location ${shortId.ifBlank { "" }} est terminee")
        }
    }

    private fun disconnect() {
        heartbeatJob?.cancel()
        ws?.close(1000, "Service stopped")
        ws = null
    }

    override fun onDestroy() {
        disconnect()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
