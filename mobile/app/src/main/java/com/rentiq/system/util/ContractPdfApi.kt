package com.rentiq.system.util

import android.content.Context
import com.rentiq.system.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

// Fetches the SAME server-rendered contract PDF the web app produces, via the
// mobile endpoint GET {WEBAPP}/api/contracts/{id}/pdf (Bearer JWT). The server
// generates/reuses the PDF, returns a short-lived presigned URL; we then stream
// the bytes to a local cache file for PdfRenderer to display.
object ContractPdfApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS) // server renders @react-pdf on demand
        .build()

    data class Result(val file: File?, val error: String?)

    suspend fun fetch(context: Context, contractId: String, force: Boolean = false): Result =
        withContext(Dispatchers.IO) {
            val token = SessionManager(context).accessToken
                ?: return@withContext Result(null, "Session expirée")

            try {
                // 1) Ask the server for a presigned URL to the rendered PDF.
                val base = BuildConfig.WEBAPP_BASE_URL.trimEnd('/')
                val endpoint = "$base/api/contracts/$contractId/pdf" + if (force) "?force=1" else ""
                val metaReq = Request.Builder()
                    .url(endpoint)
                    .header("Authorization", "Bearer $token")
                    .header("Accept", "application/json")
                    .get()
                    .build()

                val url: String = client.newCall(metaReq).execute().use { res ->
                    val body = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        val msg = runCatching { JSONObject(body).optString("error") }.getOrNull()
                        return@withContext Result(null, msg?.ifBlank { null } ?: "Erreur ${res.code}")
                    }
                    JSONObject(body).optString("url").ifBlank {
                        return@withContext Result(null, "Réponse invalide du serveur")
                    }
                }

                // 2) Download the PDF bytes into cache for PdfRenderer.
                val fileReq = Request.Builder().url(url).get().build()
                client.newCall(fileReq).execute().use { res ->
                    if (!res.isSuccessful) return@withContext Result(null, "Téléchargement échoué (${res.code})")
                    val bytes = res.body?.bytes() ?: return@withContext Result(null, "PDF vide")
                    val dir = File(context.cacheDir, "contracts").apply { mkdirs() }
                    val file = File(dir, "$contractId.pdf")
                    file.writeBytes(bytes)
                    Result(file, null)
                }
            } catch (e: Exception) {
                Result(null, "Erreur réseau: ${e.message}")
            }
        }
}
