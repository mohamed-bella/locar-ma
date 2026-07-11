package com.rentiq.system.ui.contracts

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ActivityNewContractBinding
import com.rentiq.system.util.AuthSession
import kotlinx.coroutines.launch
import java.util.Calendar

class NewContractActivity : AppCompatActivity() {
    private lateinit var b: ActivityNewContractBinding
    private var reservations = listOf<Reservation>()
    private var targetReservationId: String? = null

    private val fuelLevels = listOf("empty", "quarter", "half", "three_quarters", "full")
    private val fuelLabels = listOf("Vide", "1/4", "1/2", "3/4", "Plein")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityNewContractBinding.inflate(layoutInflater)
        setContentView(b.root)
        targetReservationId = intent.getStringExtra("reservation_id")

        b.toolbar.setNavigationOnClickListener { finish() }
        b.fuelOut.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, fuelLabels)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
        b.fuelOut.setSelection(4)

        b.clientCinExpiry.setOnClickListener { pickDate(b.clientCinExpiry) }
        b.clientBirthdate.setOnClickListener { pickDate(b.clientBirthdate) }
        b.permitDate.setOnClickListener { pickDate(b.permitDate) }
        b.d2CinExpiry.setOnClickListener { pickDate(b.d2CinExpiry) }
        b.d2Birthdate.setOnClickListener { pickDate(b.d2Birthdate) }
        b.d2PermitDate.setOnClickListener { pickDate(b.d2PermitDate) }
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
                val contractRes = SupabaseClient.rest.getContracts()
                b.progress.visibility = View.GONE
                if (AuthSession.isAuthError(res.code()) || AuthSession.isAuthError(contractRes.code())) {
                    AuthSession.returnToLogin(this@NewContractActivity)
                    return@launch
                }
                if (res.isSuccessful && contractRes.isSuccessful) {
                    val reservedWithContract = contractRes.body().orEmpty()
                        .mapNotNull { it.reservationId }
                        .toSet()
                    reservations = (res.body() ?: emptyList()).filter {
                        (it.status == "pending" || it.status == "confirmed" || it.status == "active") &&
                            it.id !in reservedWithContract
                    }
                    b.reservationSpinner.adapter = ArrayAdapter(
                        this@NewContractActivity,
                        android.R.layout.simple_spinner_item,
                        reservations.map { r ->
                            "${r.clients?.fullName ?: "?"} - ${r.vehicles?.plate ?: "?"} (${r.dateStart})"
                        }
                    ).also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                    targetReservationId?.let { targetId ->
                        val index = reservations.indexOfFirst { it.id == targetId }
                        if (index >= 0) {
                            b.reservationSpinner.setSelection(index)
                        } else {
                            Toast.makeText(
                                this@NewContractActivity,
                                "Reservation deja associee a un contrat ou indisponible",
                                Toast.LENGTH_LONG,
                            ).show()
                        }
                    }
                } else {
                    val code = if (!res.isSuccessful) res.code() else contractRes.code()
                    Toast.makeText(this@NewContractActivity, AuthSession.messageFor(code), Toast.LENGTH_SHORT).show()
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

        val mileage = b.mileageOut.text.toString().toIntOrNull()
        val fuel = fuelLevels[b.fuelOut.selectedItemPosition]
        val form = mutableMapOf<String, String>()
        fun addIfNotEmpty(key: String, value: String) {
            if (value.isNotBlank()) form[key] = value
        }
        addIfNotEmpty("client_nom", b.clientNom.text.toString())
        addIfNotEmpty("client_prenom", b.clientPrenom.text.toString())
        addIfNotEmpty("client_cin_expiry", b.clientCinExpiry.text.toString())
        addIfNotEmpty("client_birthdate", b.clientBirthdate.text.toString())
        addIfNotEmpty("client_ville", b.clientVille.text.toString())
        addIfNotEmpty("client_permit_number", b.permitNumber.text.toString())
        addIfNotEmpty("client_permit_date", b.permitDate.text.toString())
        addIfNotEmpty("client_permit_place", b.permitPlace.text.toString())
        addIfNotEmpty("client_phone2", b.clientPhone2.text.toString())
        addIfNotEmpty("client_profession", b.clientProfession.text.toString())
        addIfNotEmpty("d2_nom", b.d2Name.text.toString())
        addIfNotEmpty("d2_prenom", b.d2Prenom.text.toString())
        addIfNotEmpty("d2_cin", b.d2Cin.text.toString())
        addIfNotEmpty("d2_cin_expiry", b.d2CinExpiry.text.toString())
        addIfNotEmpty("d2_birthdate", b.d2Birthdate.text.toString())
        addIfNotEmpty("d2_profession", b.d2Profession.text.toString())
        addIfNotEmpty("d2_permit_number", b.d2Permit.text.toString())
        addIfNotEmpty("d2_permit_date", b.d2PermitDate.text.toString())
        addIfNotEmpty("d2_permit_place", b.d2PermitPlace.text.toString())
        addIfNotEmpty("d2_phone", b.d2Phone.text.toString())
        addIfNotEmpty("d2_address", b.d2Address.text.toString())
        addIfNotEmpty("d2_ville", b.d2Ville.text.toString())
        addIfNotEmpty("heure_depart", b.heureDepart.text.toString())
        addIfNotEmpty("heure_retour", b.heureRetour.text.toString())

        b.progress.visibility = View.VISIBLE
        b.saveButton.isEnabled = false

        lifecycleScope.launch {
            try {
                // 1) Create contract via server API (handles dedup + reservation→active + vehicle sync)
                val createRes = SupabaseClient.api.createContract(
                    mapOf("reservation_id" to reservation.id),
                )
                if (!createRes.isSuccessful) {
                    b.progress.visibility = View.GONE
                    b.saveButton.isEnabled = true
                    Toast.makeText(this@NewContractActivity, "Erreur ${createRes.code()}", Toast.LENGTH_SHORT).show()
                    return@launch
                }
                val contractId = createRes.body()?.get("id")?.toString()
                if (contractId == null) {
                    b.progress.visibility = View.GONE
                    b.saveButton.isEnabled = true
                    Toast.makeText(this@NewContractActivity, "Erreur: id manquant", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                // 2) Update contract fields (mileage, fuel, form, check) via server API
                val updateBody = mutableMapOf<String, Any?>("id" to contractId)
                if (mileage != null) updateBody["mileage_out"] = mileage
                updateBody["fuel_out"] = fuel
                if (form.isNotEmpty()) updateBody["form"] = form
                val checkNum = b.checkNumber.text.toString()
                val checkBank = b.checkBank.text.toString()
                val checkAmt = b.checkAmount.text.toString().toDoubleOrNull()
                if (checkNum.isNotBlank()) updateBody["check_number"] = checkNum
                if (checkBank.isNotBlank()) updateBody["check_bank"] = checkBank
                if (checkAmt != null) updateBody["check_amount"] = checkAmt

                SupabaseClient.api.updateContract(updateBody)

                b.progress.visibility = View.GONE
                Toast.makeText(this@NewContractActivity, "Contrat créé", Toast.LENGTH_SHORT).show()
                startActivity(Intent(this@NewContractActivity, ContractDetailActivity::class.java).putExtra("contract_id", contractId))
                finish()
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                b.saveButton.isEnabled = true
                Toast.makeText(this@NewContractActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

}
