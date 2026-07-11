package com.rentiq.system.ui.fleet

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ActivityLogServiceBinding
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Calendar

class LogServiceActivity : AppCompatActivity() {
    private lateinit var b: ActivityLogServiceBinding
    private var vehicles = listOf<Vehicle>()
    private var initialVehicleId: String? = null

    private val typeKeys = listOf("vidange", "freins", "pneus", "courroie", "filtre", "autre")
    private val typeLabels = listOf("Vidange", "Freins", "Pneus", "Courroie", "Filtre", "Autre")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityLogServiceBinding.inflate(layoutInflater)
        setContentView(b.root)

        initialVehicleId = intent.getStringExtra("vehicle_id")
        intent.getStringExtra("vehicle_label")?.let { b.toolbar.title = it }

        b.toolbar.setNavigationOnClickListener { finish() }
        b.typeSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, typeLabels)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
        // Preselect the type when opened from a specific suivi service tile.
        intent.getStringExtra("service_type")?.let { st ->
            val idx = typeKeys.indexOf(st)
            if (idx >= 0) b.typeSpinner.setSelection(idx)
        }

        b.performedAt.setOnClickListener { pickDate(b.performedAt) }
        b.nextDueDate.setOnClickListener { pickDate(b.nextDueDate) }
        b.saveButton.setOnClickListener { save() }

        b.performedAt.setText(LocalDate.now().toString())
        loadVehicles()
    }

    private fun loadVehicles() {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicles()
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    vehicles = res.body() ?: emptyList()
                    b.vehicleSpinner.adapter = ArrayAdapter(
                        this@LogServiceActivity,
                        android.R.layout.simple_spinner_item,
                        vehicles.map { it.displayName }
                    ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                    preselectVehicle()
                } else {
                    Toast.makeText(this@LogServiceActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@LogServiceActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun preselectVehicle() {
        val wanted = initialVehicleId ?: return
        val idx = vehicles.indexOfFirst { it.id == wanted }
        if (idx >= 0) b.vehicleSpinner.setSelection(idx)
    }

    private fun pickDate(target: android.widget.EditText) {
        val cal = Calendar.getInstance()
        DatePickerDialog(this, { _, y, m, d ->
            target.setText(String.format("%04d-%02d-%02d", y, m + 1, d))
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun save() {
        val vi = b.vehicleSpinner.selectedItemPosition
        if (vi < 0 || vi >= vehicles.size) {
            Toast.makeText(this, "Sélectionner un véhicule", Toast.LENGTH_SHORT).show()
            return
        }
        val vehicle = vehicles[vi]
        val type = typeKeys.getOrElse(b.typeSpinner.selectedItemPosition) { "autre" }
        val performedAt = b.performedAt.text.toString().ifBlank { LocalDate.now().toString() }
        val odometer = b.odometerKm.text.toString().toIntOrNull()
        val cost = b.cost.text.toString().toDoubleOrNull()
        val garage = b.garage.text.toString().takeIf { it.isNotBlank() }
        val notes = b.notes.text.toString().takeIf { it.isNotBlank() }
        val nextDueKm = b.nextDueKm.text.toString().toIntOrNull()
            ?: if (type == "vidange" && odometer != null) odometer + (vehicle.oilChangeIntervalKm ?: 10000) else null
        val nextDueDate = b.nextDueDate.text.toString().takeIf { it.isNotBlank() }

        b.progress.visibility = View.VISIBLE
        b.saveButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.api.logService(
                    mapOf(
                        "vehicle_id" to vehicle.id,
                        "type" to type,
                        "performed_at" to performedAt,
                        "odometer_km" to odometer,
                        "cost" to cost,
                        "garage" to garage,
                        "notes" to notes,
                    ),
                )
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    Toast.makeText(this@LogServiceActivity, "Suivi enregistré", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    b.saveButton.isEnabled = true
                    Toast.makeText(this@LogServiceActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                b.saveButton.isEnabled = true
                Toast.makeText(this@LogServiceActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
