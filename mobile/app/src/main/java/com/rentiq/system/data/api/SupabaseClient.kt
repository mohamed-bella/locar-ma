package com.rentiq.system.data.api

import android.content.Context
import com.rentiq.system.BuildConfig
import com.rentiq.system.util.SessionManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import kotlinx.coroutines.runBlocking
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object SupabaseClient {
    private const val BASE_URL = BuildConfig.SUPABASE_URL
    private const val ANON_KEY = BuildConfig.SUPABASE_ANON_KEY

    @Volatile
    var accessToken: String? = null

    @Volatile
    private var appContext: Context? = null

    private val refreshLock = Any()

    fun bindSession(context: Context) {
        appContext = context.applicationContext
        accessToken = SessionManager(context.applicationContext).accessToken
    }

    private fun currentAccessToken(): String? {
        val memoryToken = accessToken
        if (!memoryToken.isNullOrBlank()) return memoryToken

        val storedToken = appContext?.let { SessionManager(it).accessToken }
        if (!storedToken.isNullOrBlank()) accessToken = storedToken
        return storedToken
    }

    private fun baseHeaders(includeUserToken: Boolean) = Interceptor { chain ->
        val original = chain.request()
        val req = original.newBuilder()
            .header("apikey", ANON_KEY)
            .header("Content-Type", "application/json")

        if (original.header("Prefer").isNullOrBlank()) {
            req.header("Prefer", "return=representation")
        }

        val bearer = if (includeUserToken) currentAccessToken() else ANON_KEY
        if (!bearer.isNullOrBlank()) req.header("Authorization", "Bearer $bearer")
        chain.proceed(req.build())
    }

    private fun httpClient(includeUserToken: Boolean): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor(baseHeaders(includeUserToken))
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
                        else HttpLoggingInterceptor.Level.NONE
            })

        if (includeUserToken) {
            builder.authenticator { _, response ->
                if (responseCount(response) >= 2) return@authenticator null
                val refreshedToken = refreshStoredSession() ?: return@authenticator null
                response.request.newBuilder()
                    .header("Authorization", "Bearer $refreshedToken")
                    .build()
            }
        }

        return builder.build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }

    private fun refreshStoredSession(): String? = synchronized(refreshLock) {
        val context = appContext ?: return@synchronized null
        val session = SessionManager(context)
        val refreshToken = session.refreshToken ?: return@synchronized null
        try {
            val res = runBlocking { auth.refresh(RefreshRequest(refreshToken)) }
            val body = res.body()
            if (res.isSuccessful && body != null) {
                session.accessToken = body.accessToken
                session.refreshToken = body.refreshToken
                session.userId = body.user?.id ?: session.userId
                accessToken = body.accessToken
                body.accessToken
            } else {
                if (res.code() in 400..499) {
                    session.clear()
                    accessToken = null
                }
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun retrofit(includeUserToken: Boolean): Retrofit = Retrofit.Builder()
        .baseUrl("$BASE_URL/")
        .client(httpClient(includeUserToken))
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    // Auth endpoints must not receive an expired user JWT while refreshing.
    val auth: AuthApi = retrofit(includeUserToken = false).create(AuthApi::class.java)
    val rest: RestApi = retrofit(includeUserToken = true).create(RestApi::class.java)
}
