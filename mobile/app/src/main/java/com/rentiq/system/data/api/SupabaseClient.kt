package com.rentiq.system.data.api

import com.rentiq.system.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object SupabaseClient {
    private const val BASE_URL = BuildConfig.SUPABASE_URL
    private const val ANON_KEY = BuildConfig.SUPABASE_ANON_KEY

    @Volatile
    var accessToken: String? = null

    private val authInterceptor = Interceptor { chain ->
        val req = chain.request().newBuilder()
            .addHeader("apikey", ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=representation")
        accessToken?.let { req.addHeader("Authorization", "Bearer $it") }
        chain.proceed(req.build())
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
                    else HttpLoggingInterceptor.Level.NONE
        })
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("$BASE_URL/")
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val auth: AuthApi = retrofit.create(AuthApi::class.java)
    val rest: RestApi = retrofit.create(RestApi::class.java)
}
