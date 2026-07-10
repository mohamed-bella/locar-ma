package com.rentiq.system.data.api

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)

data class AuthResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("expires_in") val expiresIn: Int,
    val user: AuthUser?,
)

data class AuthUser(
    val id: String,
    val email: String?,
)

data class RefreshRequest(
    @SerializedName("refresh_token") val refreshToken: String,
)

interface AuthApi {
    @POST("auth/v1/token?grant_type=password")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("auth/v1/token?grant_type=refresh_token")
    suspend fun refresh(@Body body: RefreshRequest): Response<AuthResponse>
}
