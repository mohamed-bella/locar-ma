package com.rentiq.system.ui.fleet

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.VehicleIssueInsert
import com.rentiq.system.databinding.ActivityVehicleIssueBinding
import com.rentiq.system.util.Notify
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Calendar

class VehicleIssueActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleIssueBinding
    private lateinit var vehicleId: String

    private val kinds = listOf("problem", "accident", "garage", "admin", "cleaning")
    private val categories = listOf("mechanical", "electrical", "body", "tyres", "brakes", "other")
    private val severities = listOf("medium", "low", "critical")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityVehicleIssueBinding.inflate(layoutInflater)
        setContentView(b.root)

        vehicleId = intent.getStringExtra("vehicle_id") ?: run { finish(); return }
        b.vehicleLabel.text = intent.getStringExtra("vehicle_label") ?: "Vehicule"
        b.toolbar.setNavigationOnClickListener { finish() }

        b.kind.adapter = spinnerAdapter(kinds)
        b.category.adapter = spinnerAdapter(categories)
        b.severity.adapter = spinnerAdapter(severities)
        b.openedAt.setText(LocalDate.now().toString())
        b.openedAt.setOnClickListener { pickDate(b.openedAt) }
        b.kind.setOnItemSelectedListener(SimpleItemSelectedListener { updateBlockSuggestion() })
        b.severity.setOnItemSelectedListener(SimpleItemSelectedListener { updateBlockSuggestion() })
        b.saveButton.setOnClickListener { save() }
    }

    private fun spinnerAdapter(values: List<String>): ArrayAdapter<String> =
        ArrayAdapter(this, android.R.layout.simple_spinner_item, values).also {
            it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    private fun updateBlockSuggestion() {
        val kind = selected(kinds, b.kind.selectedItemPosition)
        val severity = selected(severities, b.severity.selectedItemPosition)
        b.blocksRental.isChecked = kind in setOf("accident", "garage") || severity == "critical"
    }

    private fun pickDate(target: EditText) {
        val seed = runCatching { LocalDate.parse(target.text.toString().take(10)) }.getOrNull()
        val cal = Calendar.getInstance()
        seed?.let {
            cal.set(Calendar.YEAR, it.year)
            cal.set(Calendar.MONTH, it.monthValue - 1)
            cal.set(Calendar.DAY_OF_MONTH, it.dayOfMonth)
        }
        DatePickerDialog(this, { _, y, m, d ->
            target.setText(LocalDate.of(y, m + 1, d).toString())
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun save() {
        val agencyId = SessionManager(this).agencyId
        val title = b.title.text.toString().trim()
        if (agencyId.isNullOrBlank()) {
            Toast.makeText(this, "Agence non trouvee", Toast.LENGTH_SHORT).show()
            return
        }
        if (title.isBlank()) {
            Toast.makeText(this, "Titre obligatoire", Toast.LENGTH_SHORT).show()
            return
        }

        setLoading(true)
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.createVehicleIssue(
                    VehicleIssueInsert(
                        agencyId = agencyId,
                        vehicleId = vehicleId,
                        kind = selected(kinds, b.kind.selectedItemPosition),
                        category = selected(categories, b.category.selectedItemPosition),
                        severity = selected(severities, b.severity.selectedItemPosition),
                        blocksRental = b.blocksRental.isChecked,
                        title = title,
                        description = nullable(b.description.text.toString()),
                        cost = b.cost.text.toString().toDoubleOrNull(),
                        garage = nullable(b.garage.text.toString()),
                        openedAt = b.openedAt.text.toString().ifBlank { LocalDate.now().toString() },
                    ),
                )
                if (res.isSuccessful) {
                    Notify.enqueue(
                        agencyId,
                        "vehicle_issue_created",
                        mapOf(
                            "vehicle_id" to vehicleId,
                            "vehicle" to b.vehicleLabel.text.toString(),
                            "title" to title,
                            "kind" to selected(kinds, b.kind.selectedItemPosition),
                            "category" to selected(categories, b.category.selectedItemPosition),
                            "severity" to selected(severities, b.severity.selectedItemPosition),
                            "blocks_rental" to b.blocksRental.isChecked,
                            "opened_at" to b.openedAt.text.toString(),
                        ),
                    )
                    Toast.makeText(this@VehicleIssueActivity, "Probleme enregistre", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    Toast.makeText(this@VehicleIssueActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@VehicleIssueActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                setLoading(false)
            }
        }
    }

    private fun selected(values: List<String>, index: Int): String = values.getOrElse(index) { values.first() }

    private fun nullable(value: String): String? = value.trim().ifBlank { null }

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
