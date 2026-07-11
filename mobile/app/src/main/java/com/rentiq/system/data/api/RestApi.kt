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

    @POST("rest/v1/vehicles")
    suspend fun createVehicle(@Body body: VehicleInsert): Response<List<Vehicle>>

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

    @GET("rest/v1/vehicle_issues")
    suspend fun getVehicleIssues(
        @Query("vehicle_id") vehicleId: String,
        @Query("select") select: String = "*",
        @Query("order") order: String = "opened_at.desc",
    ): Response<List<VehicleIssue>>

    @POST("rest/v1/vehicle_issues")
    suspend fun createVehicleIssue(@Body body: VehicleIssueInsert): Response<List<VehicleIssue>>

    @PATCH("rest/v1/vehicle_issues")
    suspend fun updateVehicleIssue(
        @Query("id") id: String,
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<List<VehicleIssue>>

    @GET("rest/v1/vehicle_issues")
    suspend fun getAllVehicleIssues(
        @Query("select") select: String = "*",
        @Query("order") order: String = "opened_at.desc",
    ): Response<List<VehicleIssue>>

    @GET("rest/v1/vehicle_expenses")
    suspend fun getVehicleExpenses(
        @Query("vehicle_id") vehicleId: String,
        @Query("select") select: String = "*,vehicles(id,plate,brand,model,year,category,daily_rate,status,mileage_current,insurance_expiry,vignette_expiry,visite_tech_expiry,oil_change_last_km,oil_change_interval_km,oil_change_last_date,image_keys,notes)",
        @Query("order") order: String = "spent_at.desc,created_at.desc",
    ): Response<List<VehicleExpense>>

    @GET("rest/v1/vehicle_expenses")
    suspend fun getAllVehicleExpenses(
        @Query("select") select: String = "*,vehicles(id,plate,brand,model,year,category,daily_rate,status,mileage_current,insurance_expiry,vignette_expiry,visite_tech_expiry,oil_change_last_km,oil_change_interval_km,oil_change_last_date,image_keys,notes)",
        @Query("order") order: String = "spent_at.desc",
    ): Response<List<VehicleExpense>>

    @POST("rest/v1/vehicle_expenses")
    suspend fun createVehicleExpense(@Body body: VehicleExpenseInsert): Response<List<VehicleExpense>>

    @DELETE("rest/v1/vehicle_expenses")
    suspend fun deleteVehicleExpense(
        @Query("id") id: String,
        @Header("Prefer") prefer: String = "return=minimal",
    ): Response<Unit>

    // ── WhatsApp notification queue (bot polls / subscribes) ──────────────────
    @POST("rest/v1/notification_queue")
    suspend fun createNotification(
        @Body body: NotificationInsert,
        @Header("Prefer") prefer: String = "return=minimal",
    ): Response<Unit>

    @POST("rest/v1/rpc/enqueue_mobile_notification")
    suspend fun enqueueMobileNotification(
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<Unit>

    // ── Clients ───────────────────────────────────────────────────────────────
    @GET("rest/v1/clients")
    suspend fun getClients(
        @Query("select") select: String = "id,full_name,phone,cin_passport,email,nationality,address,status,blacklist_reason,blacklist_date",
        @Query("order") order: String = "full_name.asc",
    ): Response<List<Client>>

    @GET("rest/v1/clients")
    suspend fun getClient(
        @Query("id") id: String,
        @Query("select") select: String = "id,full_name,phone,cin_passport,email,nationality,address,status,blacklist_reason,blacklist_date",
        @Header("Accept") accept: String = "application/vnd.pgrst.object+json",
    ): Response<Client>

    @POST("rest/v1/clients")
    suspend fun createClient(@Body body: ClientInsert): Response<List<Client>>

    @PATCH("rest/v1/clients")
    suspend fun updateClient(
        @Query("id") id: String,
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<List<Client>>

    @GET("rest/v1/reservations")
    suspend fun getClientReservations(
        @Query("client_id") clientId: String,
        @Query("select") select: String = "id,date_start,date_end,status,total_amount,vehicles(id,plate,brand,model)",
        @Query("order") order: String = "date_start.desc",
    ): Response<List<Reservation>>

    // ── Reservations ──────────────────────────────────────────────────────────
    @GET("rest/v1/reservations")
    suspend fun getReservations(
        @Query("select") select: String = "*,vehicles(id,plate,brand,model),clients(id,full_name,phone)",
        @Query("status") status: String = "not.in.(cancelled,blocked)",
        @Query("date_start") dateStart: String? = null,
        @Query("date_end") dateEnd: String? = null,
        @Query("order") order: String = "date_start.desc",
    ): Response<List<Reservation>>

    @GET("rest/v1/reservations")
    suspend fun getVehicleReservationsInRange(
        @Query("vehicle_id") vehicleId: String,
        @Query("date_start") dateStart: String,
        @Query("date_end") dateEnd: String,
        @Query("status") status: String = "not.in.(cancelled,closed)",
        @Query("select") select: String = "id,date_start,date_end,status,total_amount,vehicles(id,plate,brand,model),clients(id,full_name,phone)",
        @Query("order") order: String = "date_start.asc",
    ): Response<List<Reservation>>

    @GET("rest/v1/reservations")
    suspend fun getReservation(
        @Query("id") id: String,
        @Query("select") select: String = "*,vehicles(id,plate,brand,model,year,category,daily_rate,image_keys),clients(id,full_name,cin_passport,phone,email,address,nationality)",
        @Header("Accept") accept: String = "application/vnd.pgrst.object+json",
    ): Response<Reservation>

    @GET("rest/v1/contracts")
    suspend fun getContractsByReservation(
        @Query("reservation_id") reservationId: String,
        @Query("select") select: String = "id,signed_at,closed_at,sign_token,created_at",
        @Query("order") order: String = "created_at.desc",
    ): Response<List<Contract>>

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

    @GET("rest/v1/agencies")
    suspend fun getAgency(
        @Query("id") id: String,
        @Query("select") select: String = "id,name,slug,city,logo_url,stamp_url,whatsapp_number,whatsapp_enabled,legal_name,address,ice,rc,patente,rib,company_phone",
        @Header("Accept") accept: String = "application/vnd.pgrst.object+json",
    ): Response<AgencyProfile>

    @PATCH("rest/v1/agencies")
    suspend fun updateAgency(
        @Query("id") id: String,
        @Body body: @JvmSuppressWildcards Map<String, Any?>,
    ): Response<List<AgencyProfile>>
}
