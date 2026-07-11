package com.rentiq.system.util

import android.content.Context
import android.net.Uri
import com.rentiq.system.BuildConfig
import com.rentiq.system.data.api.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

object R2Uploader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private const val MAX_IMAGE_BYTES = 10 * 1024 * 1024

    // The server signs one short-lived PUT. No R2 credential is ever shipped in the APK.
    suspend fun uploadImage(ctx: Context, uri: Uri): String? = withContext(Dispatchers.IO) {
        try {
            val upload = readUpload(ctx, uri) ?: return@withContext null
            val signed = SupabaseClient.api.presignVehicleUploads(
                mapOf(
                    "files" to listOf(
                        mapOf(
                            "name" to upload.name,
                            "type" to upload.mime,
                            "size" to upload.bytes.size,
                        ),
                    ),
                ),
            )
            if (!signed.isSuccessful) return@withContext null
            val target = signed.body()?.firstOrNull() ?: return@withContext null
            val key = target["key"] ?: return@withContext null
            val url = target["url"] ?: return@withContext null
            if (putPresigned(url, upload.bytes, upload.mime)) key else null
        } catch (_: Exception) { null }
    }

    suspend fun uploadPublicImage(ctx: Context, uri: Uri, folder: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                val upload = readUpload(ctx, uri) ?: return@withContext null
                val asset = if (folder.contains("stamp", ignoreCase = true)) "stamp" else "logo"
                val signed = SupabaseClient.api.presignBrandUpload(
                    mapOf(
                        "asset" to asset,
                        "name" to upload.name,
                        "type" to upload.mime,
                        "size" to upload.bytes.size,
                    ),
                )
                if (!signed.isSuccessful) return@withContext null
                val target = signed.body() ?: return@withContext null
                val url = target["url"] ?: return@withContext null
                val key = target["key"] ?: return@withContext null
                if (!putPresigned(url, upload.bytes, upload.mime)) return@withContext null
                target["public_url"] ?: "${BuildConfig.R2_PUBLIC_URL.trimEnd('/')}/$key"
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun readUpload(ctx: Context, uri: Uri): Upload? {
        val declaredSize = runCatching {
            ctx.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        }.getOrNull()
        if (declaredSize != null && declaredSize > MAX_IMAGE_BYTES) return null

        val bytes = ctx.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val chunk = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val read = input.read(chunk)
                if (read < 0) break
                total += read
                if (total > MAX_IMAGE_BYTES) return null
                output.write(chunk, 0, read)
            }
            output.toByteArray()
        } ?: return null
        if (bytes.isEmpty() || bytes.size > MAX_IMAGE_BYTES) return null
        val mime = ctx.contentResolver.getType(uri)?.takeIf { it.startsWith("image/") } ?: "image/jpeg"
        val ext = when {
            mime.contains("png", ignoreCase = true) -> "png"
            mime.contains("webp", ignoreCase = true) -> "webp"
            else -> "jpg"
        }
        return Upload("mobile-upload.$ext", mime, bytes)
    }

    private fun putPresigned(url: String, bytes: ByteArray, contentType: String): Boolean {
        val request = Request.Builder()
            .url(url)
            .put(bytes.toRequestBody(contentType.toMediaTypeOrNull()))
            .header("Content-Type", contentType)
            .build()
        return client.newCall(request).execute().use { it.isSuccessful }
    }

    private data class Upload(val name: String, val mime: String, val bytes: ByteArray)
}
