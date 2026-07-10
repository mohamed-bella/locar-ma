package com.rentiq.system.util

import android.content.Context
import android.net.Uri
import com.rentiq.system.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object R2Uploader {

    private val client = OkHttpClient()
    private val ENDPOINT = "https://${BuildConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    // Upload a local image Uri to R2, returns the storage key (e.g. "vehicles/uuid.jpg") or null on failure.
    suspend fun uploadImage(ctx: Context, uri: Uri): String? = withContext(Dispatchers.IO) {
        try {
            val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: return@withContext null
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val ext = when {
                mime.contains("png", ignoreCase = true)  -> "png"
                mime.contains("webp", ignoreCase = true) -> "webp"
                else -> "jpg"
            }
            val key = "vehicles/${UUID.randomUUID()}.$ext"
            put(bytes, key, mime)
        } catch (_: Exception) { null }
    }

    suspend fun uploadPublicImage(ctx: Context, uri: Uri, folder: String): String? {
        val safeFolder = folder.trim('/').ifBlank { "agency" }
        val key = uploadImageTo(ctx, uri, safeFolder) ?: return null
        return "${BuildConfig.R2_PUBLIC_URL}/$key"
    }

    private suspend fun uploadImageTo(ctx: Context, uri: Uri, folder: String): String? = withContext(Dispatchers.IO) {
        try {
            val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: return@withContext null
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val ext = when {
                mime.contains("png", ignoreCase = true) -> "png"
                mime.contains("webp", ignoreCase = true) -> "webp"
                else -> "jpg"
            }
            val key = "$folder/${UUID.randomUUID()}.$ext"
            put(bytes, key, mime)
        } catch (_: Exception) {
            null
        }
    }

    // Upload raw bytes to the PRIVATE docs bucket (contracts/signatures — PII).
    // Returns the storage key on success. Used for on-place signature PNGs so the
    // server can bake them into the PDF exactly like the web signing flow.
    suspend fun uploadToDocs(bytes: ByteArray, key: String, contentType: String): String? =
        withContext(Dispatchers.IO) {
            try { put(bytes, key, contentType, BuildConfig.R2_DOCS_BUCKET) } catch (_: Exception) { null }
        }

    // Raw PUT — returns key on success, null on failure.
    private fun put(bytes: ByteArray, key: String, contentType: String, bucket: String = BuildConfig.R2_BUCKET): String? = try {
        val utcDate = sdf("yyyyMMdd")
        val utcDateTime = sdf("yyyyMMdd'T'HHmmss'Z'")
        val now = Date()
        val dateStr = utcDate.format(now)
        val datetimeStr = utcDateTime.format(now)

        val host = "${BuildConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        val path = "/$bucket/${encodePath(key)}"
        val payloadHash = sha256(bytes)
        val signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date"
        val canonicalHeaders = "content-type:$contentType\nhost:$host\nx-amz-content-sha256:$payloadHash\nx-amz-date:$datetimeStr\n"
        val canonicalRequest = "PUT\n$path\n\n$canonicalHeaders\n$signedHeaders\n$payloadHash"
        val scope = "$dateStr/auto/s3/aws4_request"
        val stringToSign = "AWS4-HMAC-SHA256\n$datetimeStr\n$scope\n${sha256(canonicalRequest)}"
        val sigKey = signingKey(dateStr)
        val signature = hmacHex(sigKey, stringToSign)
        val auth = "AWS4-HMAC-SHA256 Credential=${BuildConfig.R2_ACCESS_KEY_ID}/$scope, SignedHeaders=$signedHeaders, Signature=$signature"

        val req = Request.Builder()
            .url("$ENDPOINT/$bucket/$key")
            .put(bytes.toRequestBody(contentType.toMediaTypeOrNull()))
            .header("Content-Type", contentType)
            .header("x-amz-date", datetimeStr)
            .header("x-amz-content-sha256", payloadHash)
            .header("Authorization", auth)
            .build()

        client.newCall(req).execute().use { res -> if (res.isSuccessful) key else null }
    } catch (_: Exception) { null }

    private fun signingKey(date: String): ByteArray {
        val kDate    = hmac("AWS4${BuildConfig.R2_SECRET_ACCESS_KEY}".toByteArray(Charsets.UTF_8), date)
        val kRegion  = hmac(kDate,    "auto")
        val kService = hmac(kRegion,  "s3")
        return       hmac(kService,   "aws4_request")
    }

    private fun hmac(key: ByteArray, data: String): ByteArray =
        Mac.getInstance("HmacSHA256").also { it.init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data.toByteArray(Charsets.UTF_8))

    private fun hmacHex(key: ByteArray, data: String) = hmac(key, data).hex()

    private fun sha256(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).hex()
    private fun sha256(s: String)    = sha256(s.toByteArray(Charsets.UTF_8))

    private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }

    // Encode path segments for canonical URI — slashes preserved, each segment percent-encoded
    private fun encodePath(key: String): String =
        key.split("/").joinToString("/") { seg ->
            java.net.URLEncoder.encode(seg, "UTF-8").replace("+", "%20")
        }

    private fun sdf(pattern: String) = SimpleDateFormat(pattern, Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}
