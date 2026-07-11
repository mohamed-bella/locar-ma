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
import com.rentiq.system.data.repository.OperationResult
import com.rentiq.system.data.repository.OperationsRepository
import com.rentiq.system.databinding.ActivityReservationDetailBinding
import com.rentiq.system.ui.contracts.ContractDetailActivity
import com.rentiq.system.ui.contracts.NewContractActivity
import com.rentiq.system.ui.common.ReservationCardItem
import com.rentiq.system.ui.common.ReservationLifecycle
import com.rentiq.system.util.AuthSession
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Reservation hub detail: booking context plus the linked contract action.
class ReservationDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityReservationDetailBinding
    private var reservationId: String? = null
    private val repository = OperationsRepository()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReservationDetailBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        reservationId = intent.getStringExtra("reservation_id")
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
        val lifecycle = ReservationCardItem(r, contract).lifecycle()
        val (label, color) = when (lifecycle) {
            ReservationLifecycle.OVERDUE -> "Retour en retard" to R.color.red
            ReservationLifecycle.RETURN_TODAY -> "Retour aujourd’hui" to R.color.amber
            ReservationLifecycle.PICKUP_TODAY -> "Départ aujourd’hui" to R.color.blue_action
            ReservationLifecycle.ACTIVE -> "En location" to R.color.green
            ReservationLifecycle.UPCOMING -> "À venir" to R.color.blue_action
            ReservationLifecycle.CONFIRMED -> "Confirmée" to R.color.green
            ReservationLifecycle.CLOSED -> "Terminée" to R.color.muted
            ReservationLifecycle.CANCELLED -> "Archivée" to R.color.red
        }
        b.statusChip.text = label
        b.statusChip.setTextColor(ContextCompat.getColor(this, R.color.white))
        b.statusChip.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, color))

        val days = days(r.dateStart, r.dateEnd)
        b.totalAmount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: "-"
        b.priceBreakdown.text = r.dailyRate?.let { "${it.toInt()} DH/jour - $days jour${if (days > 1) "s" else ""}" } ?: ""

        val client = r.clients
        b.clientName.text = client?.fullName ?: "Client non renseigné"
        b.clientDetails.text = listOfNotNull(
            client?.cin?.let { "CIN / Passeport : $it" },
            client?.phone?.let { "Téléphone : $it" },
            client?.email?.let { "Email : $it" },
            client?.address?.let { "Adresse : $it" },
            client?.nationality?.let { "Nationalité : $it" },
        ).joinToString("\n").ifBlank { "Aucune information supplémentaire" }

        val phone = client?.phone?.replace(Regex("\\D"), "").orEmpty()
        b.callClient.visibility = if (phone.isBlank()) View.GONE else View.VISIBLE
        b.callClient.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone")))
        }

        val vehicle = r.vehicles
        b.vehicleName.text = listOfNotNull(vehicle?.brand, vehicle?.model, vehicle?.year?.toString())
            .joinToString(" ")
            .ifBlank { "Véhicule" }
        b.vehiclePlate.text = vehicle?.plate ?: "-"
        vehicle?.imageKeys?.firstOrNull()?.let { key ->
            b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$key") { crossfade(true) }
        }

        b.period.text = buildString {
            append("Du ${r.dateStart?.take(10) ?: "?"}\n")
            append("Au ${r.dateEnd?.take(10) ?: "?"}")
            r.pickupLocation?.let { append("\nDépart : $it") }
            r.dropoffLocation?.let { append("\nRetour : $it") }
        }

        if (contract != null) {
            val contractState = when {
                contract.closedAt != null -> "clôturé"
                contract.signedAt != null -> "signé"
                contract.signToken != null -> "signature envoyée"
                else -> "à signer"
            }
            b.contractStatus.text = "Contrat #${contract.shortId ?: contract.id.take(8)} · $contractState"
            b.openContract.visibility = View.VISIBLE
            b.createContract.visibility = View.GONE
            b.openContract.setOnClickListener {
                startActivity(
                    Intent(this, ContractDetailActivity::class.java)
                        .putExtra("contract_id", contract.id)
                )
            }
        } else {
            b.contractStatus.text = "Aucun contrat pour cette réservation."
            b.openContract.visibility = View.GONE
            b.createContract.visibility = if (lifecycle in setOf(ReservationLifecycle.CLOSED, ReservationLifecycle.CANCELLED)) View.GONE else View.VISIBLE
            b.createContract.setOnClickListener {
                startActivity(
                    Intent(this, NewContractActivity::class.java)
                        .putExtra("reservation_id", r.id)
                )
            }
        }

        b.archiveReservation.visibility = if (lifecycle in setOf(ReservationLifecycle.CLOSED, ReservationLifecycle.CANCELLED)) View.GONE else View.VISIBLE
        b.archiveReservation.setOnClickListener { confirmArchive(r) }
    }

    private fun confirmArchive(reservation: Reservation) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.archive_reservation)
            .setMessage(R.string.confirm_cancel_reservation)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.archive_reservation) { _, _ -> archive(reservation) }
            .show()
    }

    private fun archive(reservation: Reservation) {
        b.progress.visibility = View.VISIBLE
        b.archiveReservation.isEnabled = false
        lifecycleScope.launch {
            val result = try {
                repository.cancelReservation(reservation.id)
            } catch (e: Exception) {
                OperationResult.Failure(null, e.message ?: "Connexion impossible")
            }
            b.progress.visibility = View.GONE
            b.archiveReservation.isEnabled = true
            when (result) {
                is OperationResult.Success -> {
                    toast("Réservation archivée")
                    finish()
                }
                is OperationResult.Failure -> {
                    if (result.code == 401 || result.code == 403) AuthSession.returnToLogin(this@ReservationDetailActivity)
                    else toast(result.message)
                }
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
