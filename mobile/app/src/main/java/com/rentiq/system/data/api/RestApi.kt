package com.rentiq.system.data.api

import com.rentiq.system.data.model.*
import retrofit2.Response
import retrofit2.http.*

// Supabase PostgREST API — RLS scopes everything to the logged-in user's agency.
interface RestApi {

    // ── Vehicles ──────────────────────────────────────────────────────────────
    @GET("rest/v1/vehicles")
    suspend fun getVehicles(
        @Query("select") select: String = "*",
        @Query("order") order: String = "plate.asc",
    ): Response<List<Vehicle>>

    @GET("rest/v1/vehicles")
    suspend fun getVehicle(
        @Query("id") id: String,
        @Query("select") select: String = "*",
        @Header("Accept") accept: String = "application/vnd.pgrst.object+json",
    ): Response<Vehicle>

    @PATCH("rest/v1/vehicles")
    suspend fun updateVehicle(
        @Query("id") id: String,
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<List<Vehicle>>

    // ── Service records (suivi / entretien: vidange, freins, pneus…) ──────────
    @GET("rest/v1/service_records")
    suspend fun getVehicleServiceRecords(
        @Query("vehicle_id") vehicleId: String,
        @Query("select") select: String = "*,vehicles(id,plate,brand,model,year,category,daily_rate,status,mileage_current,insurance_expiry,vignette_expiry,visite_tech_expiry,oil_change_last_km,oil_change_interval_km,oil_change_last_date,image_keys,notes)",
        @Query("order") order: String = "performed_at.desc",
    ): Response<List<ServiceRecord>>

    @GET("rest/v1/service_records")
    suspend fun getAllServiceRecords(
        @Query("select") select: String = "*,vehicles(id,plate,brand,model,year,category,daily_rate,status,mileage_current,insurance_expiry,vignette_expiry,visite_tech_expiry,oil_change_last_km,oil_change_interval_km,oil_change_last_date,image_keys,notes)",
        @Query("order") order: String = "performed_at.desc",
    ): Response<List<ServiceRecord>>

    @POST("rest/v1/service_records")
    suspend fun createServiceRecord(@Body body: ServiceRecordInsert): Response<List<ServiceRecord>>

    // ── WhatsApp notification queue (bot polls / subscribes) ──────────────────
    @POST("rest/v1/notification_queue")
    suspend fun createNotification(@Body body: NotificationInsert): Response<Unit>

    // ── Clients ───────────────────────────────────────────────────────────────
    @GET("rest/v1/clients")
    suspend fun getClients(
        @Query("select") select: String = "*",
        @Query("order") order: String = "full_name.asc",
    ): Response<List<Client>>

    // ── Reservations ──────────────────────────────────────────────────────────
    @GET("rest/v1/reservations")
    suspend fun getReservations(
        @Query("select") select: String = "*,vehicles(id,plate,brand,model),clients(id,full_name,phone)",
        @Query("order") order: String = "date_start.desc",
    ): Response<List<Reservation>>

    @POST("rest/v1/reservations")
    suspend fun createReservation(@Body body: ReservationInsert): Response<List<Reservation>>

    @PATCH("rest/v1/reservations")
    suspend fun updateReservationStatus(
        @Query("id") id: String,
        @Body body: Map<String, String>,
    ): Response<List<Reservation>>

    @DELETE("rest/v1/reservations")
    suspend fun deleteReservation(@Query("id") id: String): Response<Unit>

    // ── Contracts ─────────────────────────────────────────────────────────────
    @GET("rest/v1/contracts")
    suspend fun getContracts(
        @Query("select") select: String = "*,reservations(id,date_start,date_end,total_amount,status,vehicles(id,plate,brand,model),clients(id,full_name,cin_passport,phone))",
        @Query("order") order: String = "created_at.desc",
    ): Response<List<Contract>>

    @GET("rest/v1/contracts")
    suspend fun getContract(
        @Query("id") id: String,
        @Query("select") select: String = "*,reservations(id,date_start,date_end,total_amount,status,vehicles(id,plate,brand,model,year,daily_rate),clients(id,full_name,cin_passport,phone,address))",
        @Header("Accept") accept: String = "application/vnd.pgrst.object+json",
    ): Response<Contract>

    @POST("rest/v1/contracts")
    suspend fun createContract(@Body body: ContractInsert): Response<List<Contract>>

    @PATCH("rest/v1/contracts")
    suspend fun updateContract(
        @Query("id") id: String,
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<List<Contract>>

    // ── Members (to find the user's agency) ───────────────────────────────────
    @GET("rest/v1/agency_members")
    suspend fun getMembers(
        @Query("select") select: String = "id,agency_id,user_id,role",
    ): Response<List<Member>>
}
