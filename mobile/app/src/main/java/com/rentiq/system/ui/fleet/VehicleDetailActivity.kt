package com.rentiq.system.ui.fleet

import android.app.DatePickerDialog
import android.content.DialogInterface
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import coil.load
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.ServiceRecord
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.data.model.VehicleExpense
import com.rentiq.system.data.model.VehicleExpenseInsert
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ActivityVehicleDetailBinding
import com.rentiq.system.ui.reservations.NewReservationActivity
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.format.DateTimeFormatter
import java.util.Calendar

class VehicleDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleDetailBinding
    private val historyAdapter = ServiceRecordAdapter()
    private val issueAdapter = VehicleIssueAdapter { issue -> confirmResolveIssue(issue) }
    private val expenseAdapter = VehicleExpenseAdapter { expense -> confirmDeleteExpense(expense) }
    private var currentVehicle: Vehicle? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityVehicleDetailBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }

        b.serviceHistory.layoutManager = LinearLayoutManager(this)
        b.serviceHistory.adapter = historyAdapter
        b.issueList.layoutManager = LinearLayoutManager(this)
        b.issueList.adapter = issueAdapter
        b.expenseList.layoutManager = LinearLayoutManager(this)
        b.expenseList.adapter = expenseAdapter
        b.addReservationButton.setOnClickListener {
            currentVehicle?.let {
                startActivity(
                    Intent(this, NewReservationActivity::class.java)
                        .putExtra("vehicle_id", it.id)
                )
            }
        }
        b.addServiceButton.setOnClickListener {
            currentVehicle?.let {
                startActivity(
                    Intent(this, LogServiceActivity::class.java)
                        .putExtra("vehicle_id", it.id)
                        .putExtra("vehicle_label", it.displayName)
                )
            }
        }
        b.addIssueButton.setOnClickListener {
            currentVehicle?.let {
                startActivity(
                    Intent(this, VehicleIssueActivity::class.java)
                        .putExtra("vehicle_id", it.id)
                        .putExtra("vehicle_label", it.displayName)
                )
            }
        }
        b.editVehicleButton.setOnClickListener {
            currentVehicle?.let {
                startActivity(
                    Intent(this, VehicleFormActivity::class.java)
                        .putExtra("vehicle_id", it.id)
                )
            }
        }
        b.addExpenseButton.setOnClickListener {
            currentVehicle?.let { showAddExpenseDialog(it) }
        }
        loadVehicle()
    }

    override fun onResume() {
        super.onResume()
        currentVehicle?.let { loadVehicle() }
    }

    private fun loadVehicle() {
        val vehicleId = intent.getStringExtra("vehicle_id") ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicle("eq.$vehicleId")
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    res.body()?.let {
                        currentVehicle = it
                        bind(it)
                        loadHistory(it.id)
                        loadIssues(it.id)
                        loadExpenses(it.id)
                    }
                } else {
                    Toast.makeText(this@VehicleDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@VehicleDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadExpenses(vehicleId: String) {
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicleExpenses("eq.$vehicleId")
                if (res.isSuccessful) {
                    val expenses = res.body().orEmpty()
                    expenseAdapter.submitList(expenses)
                    b.expensesEmpty.visibility = if (expenses.isEmpty()) View.VISIBLE else View.GONE
                    val total = expenses.sumOf { it.amount ?: 0.0 }
                    b.expensesTotal.text = "Total: ${total.toInt()} DH"
                } else {
                    b.expensesTotal.text = "Total: -"
                }
            } catch (_: Exception) {
                b.expensesTotal.text = "Total: -"
            }
        }
    }

    private fun showAddExpenseDialog(vehicle: Vehicle) {
        val pad = (14 * resources.displayMetrics.density).toInt()
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, 0)
        }
        val name = EditText(this).apply {
            hint = "Nom de la depense"
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            setSingleLine(true)
        }
        val amount = EditText(this).apply {
            hint = "Montant DH"
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setSingleLine(true)
        }
        val spentAt = EditText(this).apply {
            hint = "Date"
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            setText(LocalDate.now().toString())
            inputType = InputType.TYPE_NULL
            isFocusable = false
            setOnClickListener { pickDate(this) }
        }
        form.addView(name)
        form.addView(amount)
        form.addView(spentAt)

        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Ajouter une depense")
            .setMessage(vehicle.displayName)
            .setView(form)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save, null)
            .show()

        dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener {
            saveExpense(vehicle, name.text.toString(), amount.text.toString(), spentAt.text.toString()) {
                dialog.dismiss()
            }
        }
    }

    private fun saveExpense(vehicle: Vehicle, name: String, amountText: String, spentAt: String, onSaved: () -> Unit) {
        val agencyId = SessionManager(this).agencyId
        val amount = amountText.toDoubleOrNull()
        if (agencyId.isNullOrBlank()) {
            Toast.makeText(this, "Agence non trouvee", Toast.LENGTH_SHORT).show()
            return
        }
        if (name.trim().isBlank()) {
            Toast.makeText(this, "Nom obligatoire", Toast.LENGTH_SHORT).show()
            return
        }
        if (amount == null || amount < 0.0) {
            Toast.makeText(this, "Montant invalide", Toast.LENGTH_SHORT).show()
            return
        }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.createVehicleExpense(
                    VehicleExpenseInsert(
                        agencyId = agencyId,
                        vehicleId = vehicle.id,
                        name = name.trim(),
                        amount = amount,
                        spentAt = spentAt.ifBlank { LocalDate.now().toString() },
                    ),
                )
                if (res.isSuccessful) {
                    Toast.makeText(this@VehicleDetailActivity, "Depense ajoutee", Toast.LENGTH_SHORT).show()
                    loadExpenses(vehicle.id)
                    onSaved()
                } else {
                    Toast.makeText(this@VehicleDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@VehicleDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun confirmDeleteExpense(expense: VehicleExpense) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Supprimer la depense ?")
            .setMessage("${expense.name ?: "Depense"} - ${(expense.amount ?: 0.0).toInt()} DH")
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.delete) { _, _ -> deleteExpense(expense) }
            .show()
    }

    private fun deleteExpense(expense: VehicleExpense) {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.deleteVehicleExpense("eq.${expense.id}")
                if (res.isSuccessful) {
                    Toast.makeText(this@VehicleDetailActivity, "Depense supprimee", Toast.LENGTH_SHORT).show()
                    currentVehicle?.let { loadExpenses(it.id) }
                } else {
                    Toast.makeText(this@VehicleDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@VehicleDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun loadIssues(vehicleId: String) {
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicleIssues("eq.$vehicleId")
                if (res.isSuccessful) {
                    val issues = res.body().orEmpty()
                    issueAdapter.submitList(issues)
                    b.issuesEmpty.visibility = if (issues.isEmpty()) View.VISIBLE else View.GONE
                }
            } catch (_: Exception) {
                // The detail page should remain usable even if issue history fails.
            }
        }
    }

    private fun confirmResolveIssue(issue: VehicleIssue) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Resoudre le probleme ?")
            .setMessage(issue.title ?: "Marquer ce probleme comme resolu.")
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton("Resoudre") { _, _ -> resolveIssue(issue) }
            .show()
    }

    private fun resolveIssue(issue: VehicleIssue) {
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.updateVehicleIssue(
                    "eq.${issue.id}",
                    mapOf(
                        "status" to "resolved",
                        "resolved_at" to LocalDate.now().toString(),
                        "blocks_rental" to false,
                    ),
                )
                if (res.isSuccessful) {
                    Toast.makeText(this@VehicleDetailActivity, "Probleme resolu", Toast.LENGTH_SHORT).show()
                    currentVehicle?.let { loadIssues(it.id) }
                } else {
                    Toast.makeText(this@VehicleDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@VehicleDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadHistory(vehicleId: String) {
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicleServiceRecords("eq.$vehicleId")
                if (res.isSuccessful) {
                    historyAdapter.submitList(res.body().orEmpty())
                }
            } catch (_: Exception) {
                // best-effort; the summary view remains usable even if history fails
            }
        }
    }

    private fun bind(v: Vehicle) {
        b.toolbar.title = v.displayName
        b.vehicleName.text = v.displayName
        b.plate.text = v.plate ?: "—"

        val keys = v.imageKeys.orEmpty()
        if (keys.isNotEmpty()) {
            b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/${keys[0]}") { crossfade(true) }
        } else {
            b.vehicleImage.setImageDrawable(null)
            b.vehicleImage.setBackgroundColor(ContextCompat.getColor(this, R.color.navy_light))
        }

        // Thumbnail strip for 2+ images
        b.imageStrip.removeAllViews()
        if (keys.size > 1) {
            b.imageStripScroll.visibility = android.view.View.VISIBLE
            val thumbPx = (60 * resources.displayMetrics.density).toInt()
            keys.forEachIndexed { idx, key ->
                val iv = ImageView(this).apply {
                    layoutParams = android.widget.LinearLayout.LayoutParams(thumbPx, thumbPx).apply { marginEnd = (5 * resources.displayMetrics.density).toInt() }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    alpha = if (idx == 0) 1f else 0.65f
                    load("${BuildConfig.R2_PUBLIC_URL}/$key")
                    setOnClickListener {
                        b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$key") { crossfade(true) }
                        for (i in 0 until b.imageStrip.childCount) { (b.imageStrip.getChildAt(i) as? ImageView)?.alpha = 0.65f }
                        alpha = 1f
                    }
                }
                b.imageStrip.addView(iv)
            }
        } else {
            b.imageStripScroll.visibility = android.view.View.GONE
        }

        val (label, color) = when (v.status) {
            "available" -> getString(R.string.status_available) to R.color.green
            "rented" -> getString(R.string.status_rented) to R.color.red
            "maintenance" -> getString(R.string.status_maintenance) to R.color.amber
            "reserved" -> getString(R.string.status_reserved) to R.color.navy
            else -> (v.status ?: "—") to R.color.muted
        }
        b.status.text = label
        b.status.setTextColor(ContextCompat.getColor(this, color))

        b.year.text = v.year?.toString() ?: "—"
        b.category.text = v.category ?: "—"
        b.mileage.text = v.mileage?.let { "$it km" } ?: "—"
        b.rate.text = v.dailyRate?.let { "${it.toInt()} DH/jour" } ?: "—"

        bindSuiviDate(b.insurance, v.insuranceExpiry)
        bindSuiviDate(b.vignette, v.vignetteExpiry)
        bindSuiviDate(b.visiteTech, v.visiteTechExpiry)

        b.notes.text = v.notes?.ifBlank { "—" } ?: "—"
        b.addReservationButton.visibility = View.VISIBLE
        b.addServiceButton.visibility = View.VISIBLE
        b.editVehicleButton.visibility = View.VISIBLE
        b.addIssueButton.visibility = View.VISIBLE
        b.addExpenseButton.visibility = View.VISIBLE
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

    private fun bindSuiviDate(tv: android.widget.TextView, dateStr: String?) {
        if (dateStr.isNullOrBlank()) {
            tv.text = "—"
            tv.setTextColor(ContextCompat.getColor(this, R.color.muted))
            return
        }
        try {
            val date = LocalDate.parse(dateStr.take(10))
            val now = LocalDate.now()
            val daysLeft = ChronoUnit.DAYS.between(now, date)
            val formatted = date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
            when {
                daysLeft < 0 -> {
                    tv.text = "$formatted (expiré)"
                    tv.setTextColor(ContextCompat.getColor(this, R.color.red))
                }
                daysLeft <= 30 -> {
                    tv.text = "$formatted (${daysLeft}j)"
                    tv.setTextColor(ContextCompat.getColor(this, R.color.amber))
                }
                else -> {
                    tv.text = formatted
                    tv.setTextColor(ContextCompat.getColor(this, R.color.green))
                }
            }
        } catch (e: Exception) {
            tv.text = dateStr
            tv.setTextColor(ContextCompat.getColor(this, R.color.ink))
        }
    }
}
