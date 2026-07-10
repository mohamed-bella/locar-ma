package com.rentiq.system.ui.contracts

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.ContractInsert
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ActivityNewContractBinding
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.util.*

class NewContractActivity : AppCompatActivity() {
    private lateinit var b: ActivityNewContractBinding
    private var reservations = listOf<Reservation>()

    private val fuelLevels = listOf("empty", "quarter", "half", "three_quarters", "full")
    private val fuelLabels = listOf("Vide", "1/4", "1/2", "3/4", "Plein")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityNewContractBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.toolbar.setNavigationOnClickListener { finish() }

        b.fuelOut.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, fuelLabels)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
        b.fuelOut.setSelection(4)

        b.permitDate.setOnClickListener { pickDate(b.permitDate) }
        b.heureDepart.setOnClickListener { pickTime(b.heureDepart) }
        b.heureRetour.setOnClickListener { pickTime(b.heureRetour) }
        b.saveButton.setOnClickListener { save() }

        loadReservations()
    }

    private fun loadReservations() {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getReservations()
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    reservations = (res.body() ?: emptyList()).filter {
                        it.status == "confirmed" || it.status == "active"
                    }
                    b.reservationSpinner.adapter = ArrayAdapter(
                        this@NewContractActivity,
                        android.R.layout.simple_spinner_item,
                        reservations.map { r ->
                            "${r.clients?.fullName ?: "?"} — ${r.vehicles?.plate ?: "?"} (${r.dateStart})"
                        }
                    ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@NewContractActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun pickDate(target: android.widget.EditText) {
        val cal = Calendar.getInstance()
        DatePickerDialog(this, { _, y, m, d ->
            target.setText(String.format("%04d-%02d-%02d", y, m + 1, d))
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun pickTime(target: android.widget.EditText) {
        val cal = Calendar.getInstance()
        TimePickerDialog(this, { _, h, m ->
            target.setText(String.format("%02d:%02d", h, m))
        }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
    }

    private fun save() {
        val ri = b.reservationSpinner.selectedItemPosition
        if (ri < 0 || ri >= reservations.size) {
            Toast.makeText(this, "Sélectionner une réservation", Toast.LENGTH_SHORT).show()
            return
        }
        val reservation = reservations[ri]
        val agencyId = SessionManager(this).agencyId ?: run {
            Toast.makeText(this, "Agence non trouvée", Toast.LENGTH_SHORT).show()
            return
        }

        val mileage = b.mileageOut.text.toString().toIntOrNull()
        val fuel = fuelLevels[b.fuelOut.selectedItemPosition]

        val form = mutableMapOf<String, String>()
        fun addIfNotEmpty(key: String, value: String) { if (value.isNotBlank()) form[key] = value }
        addIfNotEmpty("client_permit_number", b.permitNumber.text.toString())
        addIfNotEmpty("client_permit_date", b.permitDate.text.toString())
        addIfNotEmpty("client_permit_place", b.permitPlace.text.toString())
        addIfNotEmpty("client_phone2", b.clientPhone2.text.toString())
        addIfNotEmpty("client_profession", b.clientProfession.text.toString())
        addIfNotEmpty("d2_nom", b.d2Name.text.toString())
        addIfNotEmpty("d2_cin", b.d2Cin.text.toString())
        addIfNotEmpty("d2_permit_number", b.d2Permit.text.toString())
        addIfNotEmpty("d2_phone", b.d2Phone.text.toString())
        addIfNotEmpty("heure_depart", b.heureDepart.text.toString())
        addIfNotEmpty("heure_retour", b.heureRetour.text.toString())

        b.progress.visibility = View.VISIBLE
        b.saveButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val body = ContractInsert(
                    agencyId = agencyId,
                    reservationId = reservation.id,
                    mileageOut = mileage,
                    fuelOut = fuel,
                    form = form.ifEmpty { null },
                )
                val res = SupabaseClient.rest.createContract(body)
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    val created = res.body()?.firstOrNull()
                    if (created != null) {
                        // Also save check info if provided
                        val checkNum = b.checkNumber.text.toString()
                        val checkBank = b.checkBank.text.toString()
                        val checkAmt = b.checkAmount.text.toString().toDoubleOrNull()
                        if (checkNum.isNotBlank() || checkBank.isNotBlank()) {
                            val update = mutableMapOf<String, Any?>()
                            if (checkNum.isNotBlank()) update["check_number"] = checkNum
                            if (checkBank.isNotBlank()) update["check_bank"] = checkBank
                            if (checkAmt != null) update["check_amount"] = checkAmt
                            SupabaseClient.rest.updateContract("eq.${created.id}", update)
                        }
                    }
                    Toast.makeText(this@NewContractActivity, "Contrat créé", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    b.saveButton.isEnabled = true
                    Toast.makeText(this@NewContractActivity, "Erreur: ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                b.saveButton.isEnabled = true
                Toast.makeText(this@NewContractActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
