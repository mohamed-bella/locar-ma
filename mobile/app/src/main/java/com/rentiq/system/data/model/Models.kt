package com.rentiq.system.data.model

import com.google.gson.annotations.SerializedName

data class Vehicle(
    val id: String,
    val plate: String?,
    val brand: String?,
    val model: String?,
    val year: Int?,
    val category: String?,
    @SerializedName("daily_rate") val dailyRate: Double?,
    val status: String?,
    @SerializedName("mileage_current") val mileage: Int?,
    @SerializedName("insurance_expiry") val insuranceExpiry: String?,
    @SerializedName("vignette_expiry") val vignetteExpiry: String?,
    @SerializedName("visite_tech_expiry") val visiteTechExpiry: String?,
    @SerializedName("oil_change_last_km") val oilChangeLastKm: Int?,
    @SerializedName("oil_change_interval_km") val oilChangeIntervalKm: Int?,
    @SerializedName("oil_change_last_date") val oilChangeLastDate: String?,
    @SerializedName("next_service_note") val nextServiceNote: String?,
    @SerializedName("image_keys") val imageKeys: List<String>?,
    val notes: String?,
) {
    val displayName: String get() = listOfNotNull(brand, model).joinToString(" ").ifBlank { plate ?: "—" }
}

data class Client(
    val id: String,
    @SerializedName("full_name") val fullName: String?,
    @SerializedName("cin_passport") val cin: String?,
    val phone: String?,
    val email: String?,
    val address: String?,
    val nationality: String?,
    val status: String?,
    @SerializedName("blacklist_reason") val blacklistReason: String?,
    @SerializedName("blacklist_date") val blacklistDate: String?,
    val blacklisted: Boolean?,
)

data class ClientInsert(
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("full_name") val fullName: String,
    val phone: String?,
    @SerializedName("cin_passport") val cin: String?,
    val email: String?,
    val nationality: String?,
    val address: String?,
    val status: String = "active",
)

data class VehicleInsert(
    @SerializedName("agency_id") val agencyId: String,
    val plate: String,
    val brand: String?,
    val model: String?,
    val year: Int?,
    val category: String?,
    @SerializedName("daily_rate") val dailyRate: Double,
    val status: String = "available",
    @SerializedName("mileage_current") val mileageCurrent: Int = 0,
    @SerializedName("insurance_expiry") val insuranceExpiry: String?,
    @SerializedName("vignette_expiry") val vignetteExpiry: String?,
    @SerializedName("visite_tech_expiry") val visiteTechExpiry: String?,
    @SerializedName("oil_change_last_km") val oilChangeLastKm: Int?,
    @SerializedName("oil_change_interval_km") val oilChangeIntervalKm: Int?,
    @SerializedName("oil_change_last_date") val oilChangeLastDate: String?,
    @SerializedName("next_service_note") val nextServiceNote: String?,
    val notes: String?,
    @SerializedName("image_keys") val imageKeys: List<String>? = null,
)

data class Reservation(
    val id: String,
    @SerializedName("vehicle_id") val vehicleId: String?,
    @SerializedName("client_id") val clientId: String?,
    @SerializedName("date_start") val dateStart: String?,
    @SerializedName("date_end") val dateEnd: String?,
    val status: String?,
    @SerializedName("total_amount") val totalAmount: Double?,
    @SerializedName("daily_rate_snap") val dailyRate: Double?,
    @SerializedName("pickup_location") val pickupLocation: String?,
    @SerializedName("dropoff_location") val dropoffLocation: String?,
    val vehicles: Vehicle?,
    val clients: Client?,
)

data class Contract(
    val id: String,
    @SerializedName("short_id") val shortId: String?,
    @SerializedName("reservation_id") val reservationId: String?,
    @SerializedName("mileage_out") val mileageOut: Int?,
    @SerializedName("mileage_in") val mileageIn: Int?,
    @SerializedName("fuel_out") val fuelOut: String?,
    @SerializedName("fuel_in") val fuelIn: String?,
    @SerializedName("check_number") val checkNumber: String?,
    @SerializedName("check_bank") val checkBank: String?,
    @SerializedName("check_amount") val checkAmount: Double?,
    @SerializedName("closed_at") val closedAt: String?,
    @SerializedName("signed_at") val signedAt: String?,
    @SerializedName("sign_token") val signToken: String?,
    @SerializedName("pdf_key") val pdfKey: String?,
    @SerializedName("signature_url") val signatureUrl: String?,
    @SerializedName("created_at") val createdAt: String?,
    val extras: Any?,
    val form: Map<String, String>?,
    val reservations: Reservation?,
)

data class Member(
    val id: String,
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("user_id") val userId: String,
    val role: String?,
)

data class AgencyProfile(
    val id: String,
    val name: String?,
    val slug: String?,
    val city: String?,
    @SerializedName("logo_url") val logoUrl: String?,
    @SerializedName("stamp_url") val stampUrl: String?,
    @SerializedName("whatsapp_number") val whatsappNumber: String?,
    @SerializedName("whatsapp_enabled") val whatsappEnabled: Boolean?,
    @SerializedName("legal_name") val legalName: String?,
    val address: String?,
    val ice: String?,
    val rc: String?,
    val patente: String?,
    val rib: String?,
    @SerializedName("company_phone") val companyPhone: String?,
)

// POST bodies
data class ReservationInsert(
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("vehicle_id") val vehicleId: String,
    @SerializedName("client_id") val clientId: String,
    @SerializedName("date_start") val dateStart: String,
    @SerializedName("date_end") val dateEnd: String,
    @SerializedName("total_amount") val totalAmount: Double,
    @SerializedName("daily_rate_snap") val dailyRate: Double,
    val status: String = "confirmed",
)

data class ContractInsert(
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("reservation_id") val reservationId: String,
    @SerializedName("mileage_out") val mileageOut: Int?,
    @SerializedName("fuel_out") val fuelOut: String?,
    val form: Map<String, String>?,
)

// Suivi / entretien (service_records)
data class ServiceRecord(
    val id: String,
    @SerializedName("vehicle_id") val vehicleId: String?,
    val type: String?,
    @SerializedName("performed_at") val performedAt: String?,
    @SerializedName("odometer_km") val odometerKm: Int?,
    val cost: Double?,
    val garage: String?,
    val notes: String?,
    @SerializedName("next_due_km") val nextDueKm: Int?,
    @SerializedName("next_due_date") val nextDueDate: String?,
    val vehicles: Vehicle?,
)

data class ServiceRecordInsert(
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("vehicle_id") val vehicleId: String,
    val type: String,
    @SerializedName("performed_at") val performedAt: String,
    @SerializedName("odometer_km") val odometerKm: Int?,
    val cost: Double?,
    val garage: String?,
    val notes: String?,
    @SerializedName("next_due_km") val nextDueKm: Int?,
    @SerializedName("next_due_date") val nextDueDate: String?,
)

data class VehicleIssue(
    val id: String,
    @SerializedName("vehicle_id") val vehicleId: String?,
    val kind: String?,
    val category: String?,
    val severity: String?,
    val status: String?,
    @SerializedName("blocks_rental") val blocksRental: Boolean?,
    val title: String?,
    val description: String?,
    val cost: Double?,
    val garage: String?,
    @SerializedName("opened_at") val openedAt: String?,
    @SerializedName("resolved_at") val resolvedAt: String?,
)

data class VehicleIssueInsert(
    @SerializedName("agency_id") val agencyId: String,
    @SerializedName("vehicle_id") val vehicleId: String,
    val kind: String,
    val category: String?,
    val severity: String,
    val status: String = "open",
    @SerializedName("blocks_rental") val blocksRental: Boolean,
    val title: String,
    val description: String?,
    val cost: Double?,
    val garage: String?,
    @SerializedName("opened_at") val openedAt: String,
)

// WhatsApp notification queue row (bot subscribes via Realtime)
data class NotificationInsert(
    @SerializedName("agency_id") val agencyId: String,
    val type: String,
    val payload: Map<String, @JvmSuppressWildcards Any?>,
)
