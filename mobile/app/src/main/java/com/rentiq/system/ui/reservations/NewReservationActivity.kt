package com.rentiq.system.ui.reservations

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.data.model.ReservationInsert
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ActivityNewReservationBinding
import com.rentiq.system.util.Notify
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Calendar

class NewReservationActivity : AppCompatActivity() {
    private lateinit var b: ActivityNewReservationBinding
    private var vehicles = listOf<Vehicle>()
    private var clients = listOf<Client>()
    private var startDate: LocalDate? = null
    private var endDate: LocalDate? = null
    private var initialVehicleId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityNewReservationBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.toolbar.setNavigationOnClickListener { finish() }
        initialVehicleId = intent.getStringExtra("vehicle_id")
        b.dateStart.setOnClickListener { pickDate(isStart = true) }
        b.dateEnd.setOnClickListener { pickDate(isStart = false) }
        b.vehicleSpinner.onItemSelectedListener = SimpleItemSelectedListener {
            autoCalcTotal()
            hideWarning()
        }
        b.saveButton.setOnClickListener { validateThenPreflight() }

        loadDropdowns()
    }

    private fun loadDropdowns() {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val vRes = SupabaseClient.rest.getVehicles()
                val cRes = SupabaseClient.rest.getClients()

                if (vRes.isSuccessful) {
                    vehicles = vRes.body().orEmpty()
                    b.vehicleSpinner.adapter = spinnerAdapter(
                        vehicles.map { "${it.plate ?: "--"} - ${it.displayName}" },
                    )
                    preselectVehicle()
                } else {
                    showWarning("Vehicules non charges: erreur ${vRes.code()}")
                }

                if (cRes.isSuccessful) {
                    clients = cRes.body().orEmpty()
                    b.clientSpinner.adapter = spinnerAdapter(
                        clients.map { it.fullName ?: it.cin ?: it.id.take(8) },
                    )
                } else {
                    showWarning("Clients non charges: erreur ${cRes.code()}")
                }
            } catch (e: Exception) {
                showWarning("Erreur de chargement: ${e.message}")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun spinnerAdapter(values: List<String>): ArrayAdapter<String> =
        ArrayAdapter(this, android.R.layout.simple_spinner_item, values).also {
            it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    private fun preselectVehicle() {
        val wanted = initialVehicleId ?: return
        val idx = vehicles.indexOfFirst { it.id == wanted }
        if (idx >= 0) b.vehicleSpinner.setSelection(idx)
    }

    private fun pickDate(isStart: Boolean) {
        val seed = if (isStart) startDate else endDate
        val cal = Calendar.getInstance()
        seed?.let {
            cal.set(Calendar.YEAR, it.year)
            cal.set(Calendar.MONTH, it.monthValue - 1)
            cal.set(Calendar.DAY_OF_MONTH, it.dayOfMonth)
        }
        DatePickerDialog(this, { _, y, m, d ->
            val date = LocalDate.of(y, m + 1, d)
            if (isStart) {
                startDate = date
                b.dateStart.setText(date.toString())
            } else {
                endDate = date
                b.dateEnd.setText(date.toString())
            }
            autoCalcTotal()
            hideWarning()
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun autoCalcTotal() {
        val s = startDate ?: return
        val e = endDate ?: return
        val vehicle = selectedVehicle() ?: return
        val rate = vehicle.dailyRate ?: return
        val days = ChronoUnit.DAYS.between(s, e).coerceAtLeast(1)
        b.totalAmount.setText((rate * days).toInt().toString())
    }

    private fun validateThenPreflight() {
        val vehicle = selectedVehicle()
        val client = selectedClient()
        val s = startDate
        val e = endDate
        if (vehicle == null || client == null || s == null || e == null) {
            Toast.makeText(this, "Remplir vehicule, client et dates", Toast.LENGTH_SHORT).show()
            return
        }
        if (e < s) {
            Toast.makeText(this, "La date retour doit etre apres la date depart", Toast.LENGTH_SHORT).show()
            return
        }
        val total = b.totalAmount.text.toString().toDoubleOrNull()
        if (total == null || total < 0.0) {
            Toast.makeText(this, "Total invalide", Toast.LENGTH_SHORT).show()
            return
        }
        val agencyId = SessionManager(this).agencyId
        if (agencyId.isNullOrBlank()) {
            Toast.makeText(this, "Agence non trouvee", Toast.LENGTH_SHORT).show()
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            try {
                val conflicts = loadConflicts(vehicle.id, s, e)
                val blockers = loadBlockingIssues(vehicle.id)
                val compliance = localComplianceWarnings(vehicle, e, blockers)
                val warnings = buildWarnings(conflicts, compliance)

                if (warnings.isNotEmpty()) {
                    setLoading(false)
                    showWarning(warnings.joinToString("\n"))
                    MaterialAlertDialogBuilder(this@NewReservationActivity)
                        .setTitle("Verifier avant reservation")
                        .setMessage(warnings.joinToString("\n\n"))
                        .setNegativeButton("Annuler", null)
                        .setPositiveButton("Continuer") { _, _ ->
                            createReservation(agencyId, vehicle, client, s, e, total)
                        }
                        .show()
                } else {
                    createReservation(agencyId, vehicle, client, s, e, total)
                }
            } catch (e: Exception) {
                setLoading(false)
                Toast.makeText(this@NewReservationActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private suspend fun loadConflicts(vehicleId: String, start: LocalDate, end: LocalDate): List<Reservation> {
        val res = SupabaseClient.rest.getVehicleReservationsInRange(
            vehicleId = "eq.$vehicleId",
            dateStart = "lte.$end",
            dateEnd = "gte.$start",
        )
        return if (res.isSuccessful) res.body().orEmpty() else emptyList()
    }

    private suspend fun loadBlockingIssues(vehicleId: String): List<VehicleIssue> {
        val res = SupabaseClient.rest.getVehicleIssues("eq.$vehicleId")
        return if (res.isSuccessful) {
            res.body().orEmpty().filter {
                it.status != "resolved" &&
                    (it.blocksRental == true || it.severity == "critical" || it.kind == "accident" || it.kind == "garage")
            }
        } else {
            emptyList()
        }
    }

    private fun localComplianceWarnings(vehicle: Vehicle, returnDate: LocalDate, blockers: List<VehicleIssue>): List<String> {
        val warnings = mutableListOf<String>()
        if (vehicle.status == "maintenance" || vehicle.status == "rented") {
            warnings += "Statut vehicule: ${vehicle.status}"
        }
        checkExpiry("Assurance", vehicle.insuranceExpiry, returnDate)?.let { warnings += it }
        checkExpiry("Vignette", vehicle.vignetteExpiry, returnDate)?.let { warnings += it }
        checkExpiry("Visite technique", vehicle.visiteTechExpiry, returnDate)?.let { warnings += it }
        blockers.forEach { warnings += "Probleme ouvert: ${it.title ?: it.kind ?: "vehicule bloque"}" }
        return warnings
    }

    private fun checkExpiry(label: String, value: String?, returnDate: LocalDate): String? {
        val date = value?.takeIf { it.isNotBlank() }?.let {
            runCatching { LocalDate.parse(it.take(10)) }.getOrNull()
        } ?: return null
        return when {
            date < LocalDate.now() -> "$label expiree le $date"
            date < returnDate -> "$label expire pendant la location ($date)"
            else -> null
        }
    }

    private fun buildWarnings(conflicts: List<Reservation>, compliance: List<String>): List<String> {
        val warnings = mutableListOf<String>()
        if (conflicts.isNotEmpty()) {
            warnings += "Conflit calendrier: ${conflicts.size} reservation(s) sur ces dates."
        }
        warnings += compliance
        return warnings
    }

    private fun createReservation(
        agencyId: String,
        vehicle: Vehicle,
        client: Client,
        start: LocalDate,
        end: LocalDate,
        total: Double,
    ) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val body = ReservationInsert(
                    agencyId = agencyId,
                    vehicleId = vehicle.id,
                    clientId = client.id,
                    dateStart = start.toString(),
                    dateEnd = end.toString(),
                    totalAmount = total,
                    dailyRate = vehicle.dailyRate ?: 0.0,
                    pickupLocation = nullable(b.pickupLocation.text.toString()),
                    dropoffLocation = nullable(b.dropoffLocation.text.toString()),
                    notes = nullable(b.notes.text.toString()),
                )
                val res = SupabaseClient.rest.createReservation(body)
                if (res.isSuccessful) {
                    val created = res.body()?.firstOrNull()
                    val notificationQueued = Notify.enqueue(
                        agencyId,
                        "reservation_created",
                        mapOf(
                            "reservation_id" to created?.id,
                            "vehicle" to vehicle.displayName,
                            "plate" to vehicle.plate,
                            "client" to (client.fullName ?: client.cin),
                            "client_phone" to client.phone,
                            "date_start" to start.toString(),
                            "date_end" to end.toString(),
                            "pickup_location" to nullable(b.pickupLocation.text.toString()),
                            "dropoff_location" to nullable(b.dropoffLocation.text.toString()),
                            "total_amount" to total,
                            "status" to "confirmed",
                        ),
                    )
                    Toast.makeText(this@NewReservationActivity, "Reservation creee", Toast.LENGTH_SHORT).show()
                    if (!notificationQueued) {
                        Toast.makeText(this@NewReservationActivity, "Notification WhatsApp non envoyee", Toast.LENGTH_LONG).show()
                    }
                    finish()
                } else {
                    val message = if (res.code() == 409) {
                        "Conflit calendrier: ce vehicule est deja reserve"
                    } else {
                        "Erreur: ${res.code()}"
                    }
                    Toast.makeText(this@NewReservationActivity, message, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@NewReservationActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun selectedVehicle(): Vehicle? =
        vehicles.getOrNull(b.vehicleSpinner.selectedItemPosition)

    private fun selectedClient(): Client? =
        clients.getOrNull(b.clientSpinner.selectedItemPosition)

    private fun nullable(value: String): String? = value.trim().ifBlank { null }

    private fun showWarning(message: String) {
        b.warningText.text = message
        b.warningText.visibility = View.VISIBLE
    }

    private fun hideWarning() {
        b.warningText.visibility = View.GONE
    }

    private fun setLoading(loading: Boolean) {
        b.progress.visibility = if (loading) View.VISIBLE else View.GONE
        b.saveButton.isEnabled = !loading
    }

    private class SimpleItemSelectedListener(
        private val onSelected: () -> Unit,
    ) : AdapterView.OnItemSelectedListener {
        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
            onSelected()
        }

        override fun onNothingSelected(parent: AdapterView<*>?) = Unit
    }
}
