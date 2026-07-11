package com.rentiq.system.ui.reservations

import android.app.DatePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ActivityNewReservationBinding
import com.rentiq.system.ui.clients.ClientFormActivity
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Calendar

class NewReservationActivity : AppCompatActivity() {
    private lateinit var binding: ActivityNewReservationBinding
    private var vehicles = listOf<Vehicle>()
    private var clients = listOf<Client>()
    private var selectedVehicle: Vehicle? = null
    private var selectedClient: Client? = null
    private var clientChoices: Map<String, Client> = emptyMap()
    private var startDate: LocalDate = LocalDate.now()
    private var endDate: LocalDate = LocalDate.now().plusDays(1)
    private var initialVehicleId: String? = null

    private val createClient = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        loadDropdowns()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityNewReservationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        initialVehicleId = intent.getStringExtra("vehicle_id")
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.dateStart.setOnClickListener { pickDate(isStart = true) }
        binding.dateEnd.setOnClickListener { pickDate(isStart = false) }
        binding.addClientButton.setOnClickListener {
            createClient.launch(Intent(this, ClientFormActivity::class.java))
        }
        binding.saveButton.setOnClickListener { validateThenPreflight() }

        binding.vehicleSpinner.setOnItemClickListener { parent, _, position, _ ->
            selectedVehicle = parent.getItemAtPosition(position) as? Vehicle
            prefillRate(selectedVehicle, force = true) // reset per-day price to the chosen car's rate
            hideWarning()
        }
        binding.clientSpinner.setOnItemClickListener { parent, _, position, _ ->
            selectedClient = clientChoices[parent.getItemAtPosition(position)?.toString()]
            hideWarning()
        }
        // Editing the per-day price re-computes the total live.
        binding.dailyRate.doAfterTextChanged { autoCalcTotal() }

        renderDates()
        loadDropdowns()
    }

    private fun loadDropdowns() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val vehicleCall = async { SupabaseClient.rest.getVehicles() }
                val clientCall = async { SupabaseClient.rest.getClients() }
                val vehicleResponse = vehicleCall.await()
                val clientResponse = clientCall.await()

                if (AuthSession.isAuthError(vehicleResponse.code()) || AuthSession.isAuthError(clientResponse.code())) {
                    AuthSession.returnToLogin(this@NewReservationActivity)
                    return@launch
                }
                if (!vehicleResponse.isSuccessful || !clientResponse.isSuccessful) {
                    val code = if (!vehicleResponse.isSuccessful) vehicleResponse.code() else clientResponse.code()
                    showWarning("Impossible de charger les données (erreur $code). Réessayez.")
                    return@launch
                }

                vehicles = vehicleResponse.body().orEmpty()
                clients = clientResponse.body().orEmpty()
                bindVehicles()
                bindClients()

                if (vehicles.isEmpty()) showWarning("Ajoutez d’abord une voiture à la flotte.")
                else if (clients.isEmpty()) showWarning("Ajoutez d’abord un client.")
            } catch (e: Exception) {
                showWarning("Erreur de chargement : ${e.message ?: "connexion impossible"}")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun bindVehicles() {
        binding.vehicleSpinner.setAdapter(VehicleDropdownAdapter(this, vehicles))

        val preferred = selectedVehicle?.id ?: initialVehicleId
        val index = vehicles.indexOfFirst { it.id == preferred }.takeIf { it >= 0 }
            ?: vehicles.indexOfFirst { it.status == "available" }.takeIf { it >= 0 }
            ?: vehicles.indices.firstOrNull()
        if (index != null) {
            selectedVehicle = vehicles[index]
            binding.vehicleSpinner.setText(VehicleDropdownAdapter.label(vehicles[index]), false)
            prefillRate(vehicles[index])
        }
    }

    // Seed the editable per-day price from the car's rate — but don't clobber a
    // price the user already typed for this session.
    private fun prefillRate(vehicle: Vehicle?, force: Boolean = false) {
        val rate = vehicle?.dailyRate ?: return
        if (force || binding.dailyRate.text.isNullOrBlank()) {
            binding.dailyRate.setText(rate.toInt().toString())
        }
        autoCalcTotal()
    }

    private fun currentRate(): Double? =
        binding.dailyRate.text?.toString()?.trim()?.toDoubleOrNull() ?: selectedVehicle?.dailyRate

    private fun bindClients() {
        val previousId = selectedClient?.id
        val labels = clients.map { client ->
            buildString {
                append(client.fullName ?: client.cin ?: "Client")
                append(" · ${client.phone ?: client.cin ?: client.id.take(6)}")
                if (client.blacklisted == true || client.status == "blacklisted") append(" · SIGNALÉ")
            }
        }
        clientChoices = labels.zip(clients).toMap()
        binding.clientSpinner.setAdapter(dropdownAdapter(labels))
        val index = clients.indexOfFirst { it.id == previousId }.takeIf { it >= 0 }
        if (index != null) {
            selectedClient = clients[index]
            binding.clientSpinner.setText(labels[index], false)
        } else {
            selectedClient = null
            binding.clientSpinner.setText("", false)
        }
    }

    private fun dropdownAdapter(values: List<String>) =
        ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, values)

    private fun pickDate(isStart: Boolean) {
        val seed = if (isStart) startDate else endDate
        val calendar = Calendar.getInstance().apply {
            set(Calendar.YEAR, seed.year)
            set(Calendar.MONTH, seed.monthValue - 1)
            set(Calendar.DAY_OF_MONTH, seed.dayOfMonth)
        }
        DatePickerDialog(
            this,
            { _, year, month, day ->
                val picked = LocalDate.of(year, month + 1, day)
                if (isStart) {
                    startDate = picked
                    if (endDate.isBefore(startDate)) endDate = startDate.plusDays(1)
                } else {
                    endDate = picked
                }
                renderDates()
                autoCalcTotal()
                hideWarning()
            },
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH),
            calendar.get(Calendar.DAY_OF_MONTH),
        ).show()
    }

    private fun renderDates() {
        binding.dateStart.setText(startDate.toString())
        binding.dateEnd.setText(endDate.toString())
        val days = ChronoUnit.DAYS.between(startDate, endDate).coerceAtLeast(1)
        binding.dateSummary.visibility = View.VISIBLE
        binding.dateSummary.text = "$days jour${if (days > 1) "s" else ""} de location"
    }

    private fun autoCalcTotal() {
        val rate = currentRate() ?: return
        val days = ChronoUnit.DAYS.between(startDate, endDate).coerceAtLeast(1)
        binding.totalAmount.setText((rate * days).toInt().toString())
        binding.dateSummary.visibility = View.VISIBLE
        binding.dateSummary.text = "$days jour${if (days > 1) "s" else ""} · ${rate.toInt()} DH / jour"
    }

    private fun validateThenPreflight() {
        val vehicle = selectedVehicle
        val client = selectedClient
        if (vehicle == null || client == null) {
            toast("Choisissez une voiture et un client.")
            return
        }
        if (endDate.isBefore(startDate)) {
            toast("La date de retour doit être après la date de départ.")
            return
        }
        val total = binding.totalAmount.text.toString().toDoubleOrNull()
        if (total == null || total <= 0.0) {
            toast("Le total doit être supérieur à zéro.")
            return
        }
        if (SessionManager(this).agencyId.isNullOrBlank()) {
            toast("Agence non trouvée. Reconnectez-vous.")
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            try {
                val conflictsCall = async { loadConflicts(vehicle.id, startDate, endDate) }
                val issuesCall = async { loadBlockingIssues(vehicle.id) }
                val conflicts = conflictsCall.await()
                val issues = issuesCall.await()
                val preflight = buildPreflight(vehicle, client, endDate, conflicts, issues)

                when {
                    preflight.blockers.isNotEmpty() -> {
                        setLoading(false)
                        showWarning(preflight.blockers.joinToString("\n"))
                        MaterialAlertDialogBuilder(this@NewReservationActivity)
                            .setTitle("Réservation impossible")
                            .setMessage(preflight.blockers.joinToString("\n\n") { "• $it" })
                            .setPositiveButton("Corriger", null)
                            .show()
                    }
                    preflight.warnings.isNotEmpty() -> {
                        setLoading(false)
                        showWarning(preflight.warnings.joinToString("\n"))
                        MaterialAlertDialogBuilder(this@NewReservationActivity)
                            .setTitle("Points à vérifier")
                            .setMessage(preflight.warnings.joinToString("\n\n") { "• $it" })
                            .setNegativeButton("Revenir", null)
                            .setPositiveButton("Créer quand même") { _, _ ->
                                createReservation(vehicle, client, total)
                            }
                            .show()
                    }
                    else -> createReservation(vehicle, client, total)
                }
            } catch (_: SessionExpiredException) {
                setLoading(false)
                AuthSession.returnToLogin(this@NewReservationActivity)
            } catch (e: Exception) {
                setLoading(false)
                showWarning(e.message ?: "La vérification a échoué. Réessayez.")
            }
        }
    }

    private suspend fun loadConflicts(vehicleId: String, start: LocalDate, end: LocalDate): List<Reservation> {
        val response = SupabaseClient.rest.getVehicleReservationsInRange(
            vehicleId = "eq.$vehicleId",
            dateStart = "lte.$end",
            dateEnd = "gte.$start",
        )
        if (AuthSession.isAuthError(response.code())) throw SessionExpiredException()
        if (!response.isSuccessful) throw IllegalStateException("Le calendrier n’a pas pu être vérifié (erreur ${response.code()}).")
        return response.body().orEmpty()
    }

    private suspend fun loadBlockingIssues(vehicleId: String): List<VehicleIssue> {
        val response = SupabaseClient.rest.getVehicleIssues("eq.$vehicleId")
        if (AuthSession.isAuthError(response.code())) throw SessionExpiredException()
        if (!response.isSuccessful) throw IllegalStateException("Les problèmes du véhicule n’ont pas pu être vérifiés (erreur ${response.code()}).")
        return response.body().orEmpty().filter { it.status != "resolved" && it.status != "closed" }
    }

    private fun buildPreflight(
        vehicle: Vehicle,
        client: Client,
        returnDate: LocalDate,
        conflicts: List<Reservation>,
        issues: List<VehicleIssue>,
    ): Preflight {
        val blockers = mutableListOf<String>()
        val warnings = mutableListOf<String>()

        if (client.blacklisted == true || client.status == "blacklisted" || client.status == "blocked") {
            blockers += "Le client est signalé${client.blacklistReason?.let { " : $it" }.orEmpty()}."
        }
        if (conflicts.isNotEmpty()) {
            val first = conflicts.first()
            blockers += "La voiture est déjà réservée du ${first.dateStart?.take(10) ?: "?"} au ${first.dateEnd?.take(10) ?: "?"}."
        }
        if (vehicle.status == "maintenance") blockers += "La voiture est actuellement en maintenance."

        issues.filter {
            it.blocksRental == true || it.severity == "critical" || it.kind == "accident" || it.kind == "garage"
        }.forEach { issue ->
            blockers += "Problème bloquant : ${issue.title ?: issue.kind ?: "véhicule indisponible"}."
        }

        if ((vehicle.status == "rented" || vehicle.status == "active") && startDate <= LocalDate.now()) {
            warnings += "La voiture est marquée en location aujourd’hui."
        }
        checkExpiry("Assurance", vehicle.insuranceExpiry, returnDate)?.let { warnings += it }
        checkExpiry("Vignette", vehicle.vignetteExpiry, returnDate)?.let { warnings += it }
        checkExpiry("Visite technique", vehicle.visiteTechExpiry, returnDate)?.let { warnings += it }
        issues.filterNot {
            it.blocksRental == true || it.severity == "critical" || it.kind == "accident" || it.kind == "garage"
        }.forEach { issue ->
            warnings += "Problème ouvert : ${issue.title ?: issue.kind ?: "à vérifier"}."
        }
        return Preflight(blockers.distinct(), warnings.distinct())
    }

    private fun checkExpiry(label: String, rawDate: String?, returnDate: LocalDate): String? {
        val date = rawDate?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
        return when {
            date < LocalDate.now() -> "$label expirée depuis le $date."
            date < returnDate -> "$label expire pendant la location ($date)."
            else -> null
        }
    }

    private fun createReservation(vehicle: Vehicle, client: Client, total: Double) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val response = SupabaseClient.api.createReservation(
                    mapOf(
                        "vehicle_id" to vehicle.id,
                        "client_id" to client.id,
                        "date_start" to startDate.toString(),
                        "date_end" to endDate.toString(),
                        "total_amount" to total,
                        "daily_rate_snap" to (currentRate() ?: vehicle.dailyRate ?: 0.0),
                        "pickup_location" to nullable(binding.pickupLocation.text?.toString().orEmpty()),
                        "dropoff_location" to nullable(binding.dropoffLocation.text?.toString().orEmpty()),
                        "notes" to nullable(binding.notes.text?.toString().orEmpty()),
                        "status" to "confirmed",
                    ),
                )
                if (AuthSession.isAuthError(response.code())) {
                    AuthSession.returnToLogin(this@NewReservationActivity)
                    return@launch
                }
                if (response.isSuccessful) {
                    val notifications = response.body()?.get("notifications") as? Map<*, *>
                    val whatsappQueued = notifications?.get("whatsapp") == "queued"
                    val emailScheduled = notifications?.get("email") == "scheduled"
                    val channelMessage = when {
                        whatsappQueued && emailScheduled -> "WhatsApp et e-mail programmés."
                        whatsappQueued -> "WhatsApp programmé · e-mail non configuré."
                        emailScheduled -> "E-mail programmé · WhatsApp désactivé ou indisponible."
                        else -> "Notifications non configurées."
                    }
                    toast("Réservation créée. $channelMessage")
                    setResult(RESULT_OK)
                    finish()
                } else {
                    val detail = runCatching { response.errorBody()?.string() }.getOrNull().orEmpty()
                    val message = when (response.code()) {
                        409 -> "Cette voiture vient d’être réservée sur les mêmes dates."
                        else -> Regex("\"error\"\\s*:\\s*\"([^\"]+)\"").find(detail)?.groupValues?.get(1)
                            ?: "La réservation n’a pas été créée (erreur ${response.code()})."
                    }
                    showWarning(message)
                }
            } catch (e: Exception) {
                showWarning("Erreur : ${e.message ?: "connexion impossible"}")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun nullable(value: String): String? = value.trim().ifBlank { null }

    private fun showWarning(message: String) {
        binding.warningText.text = message
        binding.warningText.visibility = View.VISIBLE
    }

    private fun hideWarning() {
        binding.warningText.visibility = View.GONE
    }

    private fun setLoading(loading: Boolean) {
        binding.progress.visibility = if (loading) View.VISIBLE else View.GONE
        binding.saveButton.isEnabled = !loading && vehicles.isNotEmpty() && clients.isNotEmpty()
        binding.addClientButton.isEnabled = !loading
        binding.vehicleSpinner.isEnabled = !loading
        binding.clientSpinner.isEnabled = !loading
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    private data class Preflight(val blockers: List<String>, val warnings: List<String>)
    private class SessionExpiredException : Exception()
}
