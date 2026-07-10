package com.rentiq.system.ui.reservations

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.data.model.ReservationInsert
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ActivityNewReservationBinding
import com.rentiq.system.util.Notify
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.*

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

        b.dateStart.setOnClickListener { pickDate(true) }
        b.dateEnd.setOnClickListener { pickDate(false) }
        b.saveButton.setOnClickListener { save() }

        loadDropdowns()
    }

    private fun loadDropdowns() {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val vRes = SupabaseClient.rest.getVehicles()
                val cRes = SupabaseClient.rest.getClients()
                b.progress.visibility = View.GONE

                if (vRes.isSuccessful) {
                    vehicles = vRes.body() ?: emptyList()
                    b.vehicleSpinner.adapter = ArrayAdapter(
                        this@NewReservationActivity,
                        android.R.layout.simple_spinner_item,
                        vehicles.map { "${it.plate} — ${it.displayName}" }
                    ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                    preselectVehicle()
                }

                if (cRes.isSuccessful) {
                    clients = cRes.body() ?: emptyList()
                    b.clientSpinner.adapter = ArrayAdapter(
                        this@NewReservationActivity,
                        android.R.layout.simple_spinner_item,
                        clients.map { it.fullName ?: it.cin ?: it.id.take(8) }
                    ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@NewReservationActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun preselectVehicle() {
        val wanted = initialVehicleId ?: return
        val idx = vehicles.indexOfFirst { it.id == wanted }
        if (idx >= 0) b.vehicleSpinner.setSelection(idx)
    }

    private fun pickDate(isStart: Boolean) {
        val cal = Calendar.getInstance()
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
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun autoCalcTotal() {
        val s = startDate ?: return
        val e = endDate ?: return
        val vi = b.vehicleSpinner.selectedItemPosition
        if (vi < 0 || vi >= vehicles.size) return
        val rate = vehicles[vi].dailyRate ?: return
        val days = ChronoUnit.DAYS.between(s, e).coerceAtLeast(1)
        b.totalAmount.setText((rate * days).toInt().toString())
    }

    private fun save() {
        val vi = b.vehicleSpinner.selectedItemPosition
        val ci = b.clientSpinner.selectedItemPosition
        if (vi < 0 || ci < 0 || startDate == null || endDate == null) {
            Toast.makeText(this, "Remplir tous les champs", Toast.LENGTH_SHORT).show()
            return
        }
        val vehicle = vehicles[vi]
        val client = clients[ci]
        val total = b.totalAmount.text.toString().toDoubleOrNull() ?: 0.0
        val agencyId = SessionManager(this).agencyId ?: run {
            Toast.makeText(this, "Agence non trouvée", Toast.LENGTH_SHORT).show()
            return
        }

        b.progress.visibility = View.VISIBLE
        b.saveButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val body = ReservationInsert(
                    agencyId = agencyId,
                    vehicleId = vehicle.id,
                    clientId = client.id,
                    dateStart = startDate.toString(),
                    dateEnd = endDate.toString(),
                    totalAmount = total,
                    dailyRate = vehicle.dailyRate ?: 0.0,
                )
                val res = SupabaseClient.rest.createReservation(body)
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    Toast.makeText(this@NewReservationActivity, "Réservation créée", Toast.LENGTH_SHORT).show()
                    val created = res.body()?.firstOrNull()
                    val notificationQueued = Notify.enqueue(agencyId, "reservation_created", mapOf(
                        "reservation_id" to created?.id,
                        "vehicle" to vehicle.displayName,
                        "plate" to vehicle.plate,
                        "client" to (client.fullName ?: client.cin),
                        "client_phone" to client.phone,
                        "date_start" to startDate.toString(),
                        "date_end" to endDate.toString(),
                        "total_amount" to total,
                    ))
                    if (!notificationQueued) {
                        Toast.makeText(this@NewReservationActivity, "Notification WhatsApp non envoyee", Toast.LENGTH_LONG).show()
                    }
                    finish()
                } else {
                    b.saveButton.isEnabled = true
                    Toast.makeText(this@NewReservationActivity, "Erreur: ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                b.saveButton.isEnabled = true
                Toast.makeText(this@NewReservationActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
