package com.rentiq.system.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.rentiq.system.BuildConfig
import com.rentiq.system.util.NotificationHelper
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.*
import okhttp3.*
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
        const val KEY_VEHICLES = "notif_vehicles"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var ws: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var refCounter = 1

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // infinite — WebSocket
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
        connect()
        return START_STICKY
    }

    private fun connect() {
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
                startHeartbeat(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                heartbeatJob?.cancel()
                scope.launch {
                    delay(30_000)
                    connect()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                heartbeatJob?.cancel()
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
            val prefs = getSharedPreferences(PREF_FILE, MODE_PRIVATE)

            when {
                table == "reservations" && type == "INSERT" -> {
                    if (!prefs.getBoolean(KEY_RESERVATIONS, true)) return
                    NotificationHelper.notify(this, "Nouvelle réservation 📅", "Une nouvelle réservation a été créée")
                }
                table == "contracts" && type == "UPDATE" -> {
                    val signedAt = record.optString("signed_at", "")
                    if (signedAt.isBlank()) return
                    val oldRecord = data.optJSONObject("old_record")
                    if (oldRecord?.optString("signed_at", "")?.isNotBlank() == true) return
                    if (!prefs.getBoolean(KEY_SIGNATURES, true)) return
                    val shortId = record.optString("short_id", "")
                    NotificationHelper.notify(this, "Contrat signé ✅", "Contrat ${shortId.ifBlank { "" }} signé par le client")
                }
                table == "vehicles" && type == "INSERT" -> {
                    if (!prefs.getBoolean(KEY_VEHICLES, true)) return
                    val plate = record.optString("plate", "")
                    NotificationHelper.notify(this, "Nouveau véhicule 🚗", "Véhicule ${plate.ifBlank { "" }} ajouté à la flotte")
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun disconnect() {
        heartbeatJob?.cancel()
        ws?.close(1000, "Service arrêté")
        ws = null
    }

    override fun onDestroy() {
        disconnect()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
