package com.rentiq.system.ui.reservations

import android.content.Intent
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Contract
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ActivityReservationDetailBinding
import com.rentiq.system.ui.contracts.ContractDetailActivity
import com.rentiq.system.ui.contracts.NewContractActivity
import com.rentiq.system.util.AuthSession
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Reservation hub detail: booking context plus the linked contract action.
class ReservationDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityReservationDetailBinding
    private var reservationId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReservationDetailBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        reservationId = intent.getStringExtra("reservation_id")
        load()
    }

    override fun onResume() {
        super.onResume()
        if (reservationId != null) load()
    }

    private fun load() {
        val id = reservationId ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val reservationCall = async { SupabaseClient.rest.getReservation("eq.$id") }
                val contractCall = async { SupabaseClient.rest.getContractsByReservation("eq.$id") }
                val reservationResponse = reservationCall.await()
                val contractResponse = contractCall.await()
                b.progress.visibility = View.GONE

                if (AuthSession.isAuthError(reservationResponse.code()) || AuthSession.isAuthError(contractResponse.code())) {
                    AuthSession.returnToLogin(this@ReservationDetailActivity)
                    return@launch
                }
                if (!reservationResponse.isSuccessful) {
                    toast(AuthSession.messageFor(reservationResponse.code()))
                    finish()
                    return@launch
                }
                if (!contractResponse.isSuccessful) {
                    toast(AuthSession.messageFor(contractResponse.code()))
                }

                val reservation = reservationResponse.body()
                val contract = contractResponse.body()?.firstOrNull()
                if (reservation == null) {
                    toast("Reservation introuvable")
                    finish()
                    return@launch
                }
                bind(reservation, contract)
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                toast("Erreur: ${e.message}")
            }
        }
    }

    private fun bind(r: Reservation, contract: Contract?) {
        val (label, color) = when (r.status) {
            "confirmed" -> "Confirmee" to R.color.green
            "active" -> "Active" to R.color.navy
            "pending" -> "En attente" to R.color.amber
            "closed" -> "Terminee" to R.color.muted
            "cancelled" -> "Annulee" to R.color.red
            else -> (r.status ?: "-") to R.color.muted
        }
        b.statusChip.text = label
        b.statusChip.setTextColor(ContextCompat.getColor(this, R.color.white))
        b.statusChip.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, color))

        val days = days(r.dateStart, r.dateEnd)
        b.totalAmount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: "-"
        b.priceBreakdown.text = r.dailyRate?.let { "${it.toInt()} DH/jour - $days jour${if (days > 1) "s" else ""}" } ?: ""

        val client = r.clients
        b.clientName.text = client?.fullName ?: "Client"
        b.clientDetails.text = listOfNotNull(
            client?.cin?.let { "CIN / Passeport : $it" },
            client?.phone?.let { "Telephone : $it" },
            client?.email?.let { "Email : $it" },
            client?.address?.let { "Adresse : $it" },
            client?.nationality?.let { "Nationalite : $it" },
        ).joinToString("\n").ifBlank { "Aucune information supplementaire" }

        val phone = client?.phone?.replace(Regex("\\D"), "").orEmpty()
        b.callClient.visibility = if (phone.isBlank()) View.GONE else View.VISIBLE
        b.callClient.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone")))
        }

        val vehicle = r.vehicles
        b.vehicleName.text = listOfNotNull(vehicle?.brand, vehicle?.model, vehicle?.year?.toString())
            .joinToString(" ")
            .ifBlank { "Vehicule" }
        b.vehiclePlate.text = vehicle?.plate ?: "-"
        vehicle?.imageKeys?.firstOrNull()?.let { key ->
            b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$key") { crossfade(true) }
        }

        b.period.text = buildString {
            append("Du ${r.dateStart?.take(10) ?: "?"}\n")
            append("Au ${r.dateEnd?.take(10) ?: "?"}")
            r.pickupLocation?.let { append("\nDepart : $it") }
            r.dropoffLocation?.let { append("\nRetour : $it") }
        }

        if (contract != null) {
            val contractState = when {
                contract.closedAt != null -> "Cloture"
                contract.signedAt != null -> "Signe"
                else -> "En cours - pas encore signe"
            }
            b.contractStatus.text = "Contrat #${contract.shortId ?: contract.id.take(8)} - $contractState"
            b.openContract.visibility = View.VISIBLE
            b.createContract.visibility = View.GONE
            b.openContract.setOnClickListener {
                startActivity(
                    Intent(this, ContractDetailActivity::class.java)
                        .putExtra("contract_id", contract.id)
                )
            }
        } else {
            b.contractStatus.text = "Aucun contrat pour cette reservation."
            b.openContract.visibility = View.GONE
            b.createContract.visibility = View.VISIBLE
            b.createContract.setOnClickListener {
                startActivity(
                    Intent(this, NewContractActivity::class.java)
                        .putExtra("reservation_id", r.id)
                )
            }
        }
    }

    private fun days(start: String?, end: String?): Long {
        val s = start?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return 1
        val e = end?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return 1
        return ChronoUnit.DAYS.between(s, e).coerceAtLeast(1)
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
