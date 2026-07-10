package com.rentiq.system.ui.reservations

import android.content.Intent
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
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Full read-only view of one reservation: client, vehicle, period, pricing and
// the linked contract (open it, or create one if none exists yet).
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
        // Contract may have been created/updated on the contract screen.
        if (reservationId != null) load()
    }

    private fun load() {
        val id = reservationId ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resCall = async { SupabaseClient.rest.getReservation("eq.$id") }
                val conCall = async { SupabaseClient.rest.getContractsByReservation("eq.$id") }
                val reservation = resCall.await().body()
                val contract = conCall.await().body()?.firstOrNull()
                b.progress.visibility = View.GONE
                if (reservation == null) { toast("Réservation introuvable"); finish(); return@launch }
                bind(reservation, contract)
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                toast("Erreur: ${e.message}")
            }
        }
    }

    private fun bind(r: Reservation, contract: Contract?) {
        // Hero
        val (label, color) = when (r.status) {
            "confirmed" -> "Confirmée" to R.color.green
            "active" -> "Active" to R.color.navy
            "pending" -> "En attente" to R.color.amber
            "closed" -> "Terminée" to R.color.muted
            "cancelled" -> "Annulée" to R.color.red
            else -> (r.status ?: "—") to R.color.muted
        }
        b.statusChip.text = label
        b.statusChip.setTextColor(ContextCompat.getColor(this, R.color.white))

        val days = days(r.dateStart, r.dateEnd)
        b.totalAmount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: "—"
        b.priceBreakdown.text = r.dailyRate?.let { "${it.toInt()} DH/jour · $days jour${if (days > 1) "s" else ""}" } ?: ""

        // Client
        val cl = r.clients
        b.clientName.text = cl?.fullName ?: "Client"
        b.clientDetails.text = listOfNotNull(
            cl?.cin?.let { "CIN / Passeport : $it" },
            cl?.phone?.let { "Téléphone : $it" },
            cl?.email?.let { "Email : $it" },
            cl?.address?.let { "Adresse : $it" },
            cl?.nationality?.let { "Nationalité : $it" },
        ).joinToString("\n").ifBlank { "Aucune information supplémentaire" }

        val phone = cl?.phone?.replace(Regex("\\D"), "").orEmpty()
        b.callClient.visibility = if (phone.isBlank()) View.GONE else View.VISIBLE
        b.callClient.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone")))
        }

        // Vehicle
        val v = r.vehicles
        b.vehicleName.text = listOfNotNull(v?.brand, v?.model, v?.year?.toString()).joinToString(" ").ifBlank { "Véhicule" }
        b.vehiclePlate.text = v?.plate ?: "—"
        val key = v?.imageKeys?.firstOrNull()
        if (key != null) b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$key") { crossfade(true) }

        // Period
        b.period.text = buildString {
            append("Du ${r.dateStart?.take(10) ?: "?"}\n")
            append("Au ${r.dateEnd?.take(10) ?: "?"}")
            r.pickupLocation?.let { append("\nDépart : $it") }
            r.dropoffLocation?.let { append("\nRetour : $it") }
        }

        // Contract
        if (contract != null) {
            val cState = when {
                contract.closedAt != null -> "Clôturé"
                contract.signedAt != null -> "Signé ✓"
                else -> "En cours — pas encore signé"
            }
            b.contractStatus.text = "Contrat #${contract.shortId ?: contract.id.take(8)} · $cState"
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

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
