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
import com.rentiq.system.util.AuthSession
import com.rentiq.system.ui.common.buildAttentionReasons
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Calendar

class VehicleDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleDetailBinding
    private val historyAdapter = ServiceRecordAdapter()
    private val issueAdapter = VehicleIssueAdapter { issue -> confirmResolveIssue(issue) }
    private val expenseAdapter = VehicleExpenseAdapter { expense -> confirmDeleteExpense(expense) }
    private var currentVehicle: Vehicle? = null
    private var serviceRecords: List<ServiceRecord> = emptyList()

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
        b.releaseMaintenanceButton.setOnClickListener {
            currentVehicle?.let { confirmReleaseMaintenance(it) }
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
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(this@VehicleDetailActivity)
                    return@launch
                }
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
                    val issues = res.body().orEmpty().filter { it.status != "resolved" && it.status != "closed" }
                    issueAdapter.submitList(issues)
                    b.issuesEmpty.visibility = if (issues.isEmpty()) View.VISIBLE else View.GONE
                    currentVehicle?.let { updateAvailabilityActions(it, issues) }
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
                    serviceRecords = res.body().orEmpty()
                    historyAdapter.submitList(serviceRecords)
                    // Records arrived → recompute the service tiles' status dots.
                    currentVehicle?.let { renderSuiviTiles(it) }
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

        renderSuiviTiles(v)

        b.notes.text = v.notes?.ifBlank { "—" } ?: "—"
        updateAvailabilityActions(v, emptyList())
        b.addServiceButton.visibility = View.VISIBLE
        b.editVehicleButton.visibility = View.VISIBLE
        b.addIssueButton.visibility = View.VISIBLE
        b.addExpenseButton.visibility = View.VISIBLE
        b.releaseMaintenanceButton.visibility = if (v.status == "maintenance") View.VISIBLE else View.GONE
    }

    private fun confirmReleaseMaintenance(vehicle: Vehicle) {
        MaterialAlertDialogBuilder(this)
            .setTitle("Remettre la voiture en service ?")
            .setMessage("L’action sera refusée si un problème bloquant est encore ouvert.")
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton("Remettre en service") { _, _ -> releaseMaintenance(vehicle) }
            .show()
    }

    private fun releaseMaintenance(vehicle: Vehicle) {
        b.progress.visibility = View.VISIBLE
        b.releaseMaintenanceButton.isEnabled = false
        lifecycleScope.launch {
            var reload = false
            try {
                val response = SupabaseClient.api.releaseVehicle(mapOf("id" to vehicle.id))
                if (AuthSession.isAuthError(response.code())) {
                    AuthSession.returnToLogin(this@VehicleDetailActivity)
                    return@launch
                }
                if (response.isSuccessful) {
                    Toast.makeText(this@VehicleDetailActivity, "Voiture remise en service", Toast.LENGTH_SHORT).show()
                    reload = true
                } else {
                    val message = if (response.code() == 409) {
                        "Résolvez d’abord les problèmes bloquants."
                    } else {
                        "Action impossible (erreur ${response.code()})"
                    }
                    Toast.makeText(this@VehicleDetailActivity, message, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@VehicleDetailActivity, "Erreur : ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                b.progress.visibility = View.GONE
                b.releaseMaintenanceButton.isEnabled = true
            }
            if (reload) loadVehicle()
        }
    }

    private fun updateAvailabilityActions(vehicle: Vehicle, issues: List<VehicleIssue>) {
        val blockers = issues.filter {
            it.blocksRental == true || it.severity == "critical" || it.kind == "accident" || it.kind == "garage"
        }
        val reasons = buildAttentionReasons(vehicle, issues)
        val blocked = vehicle.status == "maintenance" || blockers.isNotEmpty()

        b.vehicleAttention.visibility = if (reasons.isEmpty() && !blocked) View.GONE else View.VISIBLE
        b.vehicleAttention.text = when {
            blockers.isNotEmpty() -> "Location bloquée · ${blockers.first().title ?: "problème critique à résoudre"}"
            vehicle.status == "maintenance" -> "Location bloquée · véhicule en maintenance"
            reasons.isNotEmpty() -> reasons.take(2).joinToString(" · ")
            else -> ""
        }
        b.addReservationButton.visibility = View.VISIBLE
        b.addReservationButton.isEnabled = !blocked
        b.addReservationButton.text = if (blocked) "Location indisponible" else getString(R.string.quick_reservation)
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

    // ── Suivi icon-tile grid (mirrors the webapp SuiviBoard) ────────────────

    private enum class SuiviStatus { OK, SOON, EXPIRED, NEUTRAL }
    private data class SuiviTile(
        val icon: String,          // asset path under assets/icons/, e.g. "service/vidange"
        val label: String,
        val status: SuiviStatus,
        val onClick: () -> Unit,
    )

    private fun renderSuiviTiles(v: Vehicle) {
        val grid = b.suiviGrid
        grid.removeAllViews()

        val tiles = listOf(
            SuiviTile("check/kilometrage", "Kilométrage", SuiviStatus.NEUTRAL) { showKmDialog(v) },
            SuiviTile("legal/assurance", "Assurance", legalStatus(v.insuranceExpiry)) { showLegalDialog("Assurance", v.insuranceExpiry, v) },
            SuiviTile("legal/vignette", "Vignette", legalStatus(v.vignetteExpiry)) { showLegalDialog("Vignette", v.vignetteExpiry, v) },
            SuiviTile("legal/visite-technique", "Visite tech.", legalStatus(v.visiteTechExpiry)) { showLegalDialog("Visite technique", v.visiteTechExpiry, v) },
            SuiviTile("service/vidange", "Vidange", serviceStatus("vidange", v)) { showServiceDialog("vidange", "Vidange", v) },
            SuiviTile("service/pneus", "Pneus", serviceStatus("pneus", v)) { showServiceDialog("pneus", "Pneus", v) },
            SuiviTile("service/freins", "Freins", serviceStatus("freins", v)) { showServiceDialog("freins", "Freins", v) },
            SuiviTile("service/filtre", "Filtre", serviceStatus("filtre", v)) { showServiceDialog("filtre", "Filtre", v) },
        )

        val inflater = layoutInflater
        val perRow = 3
        var i = 0
        while (i < tiles.size) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
            }
            for (c in 0 until perRow) {
                val idx = i + c
                if (idx < tiles.size) {
                    val t = tiles[idx]
                    val itemB = com.rentiq.system.databinding.ItemSuiviTileBinding.inflate(inflater, row, false)
                    (itemB.root.layoutParams as LinearLayout.LayoutParams).apply { width = 0; weight = 1f }
                    itemB.tileLabel.text = t.label
                    itemB.tileIcon.load("file:///android_asset/icons/${t.icon}.png")
                    applyDot(itemB.tileDot, t.status)
                    itemB.root.setOnClickListener { t.onClick() }
                    row.addView(itemB.root)
                } else {
                    row.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })
                }
            }
            grid.addView(row)
            i += perRow
        }
    }

    private fun applyDot(dot: View, status: SuiviStatus) {
        if (status == SuiviStatus.NEUTRAL) {
            dot.visibility = View.GONE
            return
        }
        dot.visibility = View.VISIBLE
        val color = when (status) {
            SuiviStatus.OK -> R.color.green
            SuiviStatus.SOON -> R.color.amber
            SuiviStatus.EXPIRED -> R.color.red
            SuiviStatus.NEUTRAL -> R.color.muted
        }
        dot.backgroundTintList = ContextCompat.getColorStateList(this, color)
    }

    private fun legalStatus(dateStr: String?): SuiviStatus {
        val date = dateStr?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: return SuiviStatus.NEUTRAL
        val days = ChronoUnit.DAYS.between(LocalDate.now(), date)
        return when {
            days < 0 -> SuiviStatus.EXPIRED
            days <= 30 -> SuiviStatus.SOON
            else -> SuiviStatus.OK
        }
    }

    // Per-type maintenance plan defaults — mirrors the webapp SERVICE_STRATEGIES
    // (src/lib/maintenance.ts). Moroccan diesel-heavy fleet defaults.
    private data class ServicePlan(val intervalKm: Int?, val intervalMonths: Long?, val soonKm: Int, val soonDays: Long)
    private val servicePlans = mapOf(
        "vidange" to ServicePlan(10000, 12, 1000, 30),
        "courroie" to ServicePlan(60000, 60, 3000, 90),
        "freins" to ServicePlan(20000, 12, 2000, 45),
        "pneus" to ServicePlan(40000, 72, 3000, 60),
        "filtre" to ServicePlan(15000, 12, 1000, 30),
        "batterie" to ServicePlan(null, 48, 0, 60),
    )

    private data class ServiceInfo(
        val lastKm: Int?,
        val lastDate: String?,
        val dueKm: Int?,
        val dueDate: String?,
        val status: SuiviStatus,
    )

    // Current state of one service type on this car: last done, next due, status.
    // Latest logged record (falling back to the oil fields for vidange), using the
    // record's server-computed next_due_* when present else the plan interval.
    // Worst axis (km/time) wins — same rule as computeService() in the webapp.
    private fun serviceInfo(type: String, v: Vehicle): ServiceInfo {
        val p = servicePlans[type] ?: return ServiceInfo(null, null, null, null, SuiviStatus.NEUTRAL)
        val latest = serviceRecords
            .filter { it.type == type && it.vehicleId == v.id }
            .maxByOrNull { it.performedAt?.take(10) ?: "" }

        var lastKm = latest?.odometerKm
        var lastDate = latest?.performedAt?.take(10)
        if (type == "vidange") {
            if (lastKm == null) lastKm = v.oilChangeLastKm
            if (lastDate == null) lastDate = v.oilChangeLastDate?.take(10)
        }

        var dueKm = latest?.nextDueKm
        if (dueKm == null && p.intervalKm != null && lastKm != null) {
            val interval = if (type == "vidange") (v.oilChangeIntervalKm ?: p.intervalKm) else p.intervalKm
            dueKm = lastKm + interval
        }
        var dueDate = latest?.nextDueDate?.take(10)
        if (dueDate == null && p.intervalMonths != null && lastDate != null) {
            dueDate = runCatching { LocalDate.parse(lastDate).plusMonths(p.intervalMonths).toString() }.getOrNull()
        }

        if (dueKm == null && dueDate == null) {
            return ServiceInfo(lastKm, lastDate, null, null, SuiviStatus.NEUTRAL) // never serviced
        }

        var expired = false
        var soon = false
        val mileage = v.mileage
        if (dueKm != null && mileage != null) {
            val kmLeft = dueKm - mileage
            if (kmLeft < 0) expired = true else if (kmLeft <= p.soonKm) soon = true
        }
        dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.let { d ->
            val daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), d)
            if (daysLeft < 0) expired = true else if (daysLeft <= p.soonDays) soon = true
        }
        val status = when {
            expired -> SuiviStatus.EXPIRED
            soon -> SuiviStatus.SOON
            else -> SuiviStatus.OK
        }
        return ServiceInfo(lastKm, lastDate, dueKm, dueDate, status)
    }

    private fun serviceStatus(type: String, v: Vehicle): SuiviStatus = serviceInfo(type, v).status

    private fun statusText(s: SuiviStatus): String = when (s) {
        SuiviStatus.OK -> "À jour"
        SuiviStatus.SOON -> "Bientôt"
        SuiviStatus.EXPIRED -> "En retard"
        SuiviStatus.NEUTRAL -> "Jamais fait"
    }

    private fun statusColor(s: SuiviStatus): Int = when (s) {
        SuiviStatus.OK -> R.color.green
        SuiviStatus.SOON -> R.color.amber
        SuiviStatus.EXPIRED -> R.color.red
        SuiviStatus.NEUTRAL -> R.color.muted
    }

    // ── Per-tile info dialogs (mirror the webapp SuiviBoard's manage modal) ─────

    private fun dialogContainer(): LinearLayout {
        val pad = (18 * resources.displayMetrics.density).toInt()
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, 0)
        }
    }

    private fun infoRow(parent: LinearLayout, label: String, value: String, valueColor: Int? = null) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            val vp = (5 * resources.displayMetrics.density).toInt()
            setPadding(0, vp, 0, vp)
        }
        row.addView(android.widget.TextView(this).apply {
            text = label
            setTextColor(ContextCompat.getColor(this@VehicleDetailActivity, R.color.muted))
            textSize = 13f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        row.addView(android.widget.TextView(this).apply {
            text = value
            setTextColor(ContextCompat.getColor(this@VehicleDetailActivity, valueColor ?: R.color.ink))
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = android.view.Gravity.END
        })
        parent.addView(row)
    }

    private fun showServiceDialog(type: String, label: String, v: Vehicle) {
        val info = serviceInfo(type, v)
        val body = dialogContainer()

        infoRow(body, "État", statusText(info.status), statusColor(info.status))
        infoRow(body, "Dernier entretien", when {
            info.lastKm != null -> "${info.lastKm} km" + (info.lastDate?.let { " · $it" } ?: "")
            info.lastDate != null -> info.lastDate
            else -> "—"
        })
        info.dueKm?.let { infoRow(body, "Prochain (km)", "$it km") }
        info.dueDate?.let { infoRow(body, "Prochaine échéance", it) }
        v.mileage?.let { infoRow(body, "Kilométrage actuel", "$it km") }

        val hist = serviceRecords.filter { it.type == type && it.vehicleId == v.id }
            .sortedByDescending { it.performedAt?.take(10) ?: "" }
            .take(3)
        if (hist.isNotEmpty()) {
            body.addView(android.widget.TextView(this).apply {
                text = "HISTORIQUE"
                setTextColor(ContextCompat.getColor(this@VehicleDetailActivity, R.color.muted))
                textSize = 11f
                letterSpacing = 0.06f
                val t = (10 * resources.displayMetrics.density).toInt()
                setPadding(0, t, 0, 0)
            })
            hist.forEach { r ->
                infoRow(
                    body,
                    r.performedAt?.take(10) ?: "—",
                    listOfNotNull(
                        r.odometerKm?.let { "$it km" },
                        r.cost?.let { "${it.toInt()} DH" },
                    ).joinToString(" · ").ifBlank { "—" },
                )
            }
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(label)
            .setView(body)
            .setNegativeButton("Fermer", null)
            .setPositiveButton("Marquer comme fait") { _, _ -> openLogService(v, type) }
            .show()
    }

    private fun showLegalDialog(label: String, dateStr: String?, v: Vehicle) {
        val status = legalStatus(dateStr)
        val date = dateStr?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val body = dialogContainer()
        infoRow(body, "État", statusText(status), statusColor(status))
        infoRow(body, "Expiration", date?.toString() ?: "—")
        if (date != null) {
            val days = ChronoUnit.DAYS.between(LocalDate.now(), date)
            infoRow(body, if (days < 0) "En retard de" else "Jours restants", "${kotlin.math.abs(days)} j")
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(label)
            .setView(body)
            .setNegativeButton("Fermer", null)
            .setPositiveButton("Modifier") { _, _ -> openEditVehicle(v) }
            .show()
    }

    private fun showKmDialog(v: Vehicle) {
        val body = dialogContainer()
        infoRow(body, "Kilométrage actuel", v.mileage?.let { "$it km" } ?: "—")
        MaterialAlertDialogBuilder(this)
            .setTitle("Kilométrage")
            .setView(body)
            .setNegativeButton("Fermer", null)
            .setPositiveButton("Modifier") { _, _ -> openEditVehicle(v) }
            .show()
    }

    private fun openEditVehicle(v: Vehicle) {
        startActivity(Intent(this, VehicleFormActivity::class.java).putExtra("vehicle_id", v.id))
    }

    private fun openLogService(v: Vehicle, type: String? = null) {
        startActivity(
            Intent(this, LogServiceActivity::class.java)
                .putExtra("vehicle_id", v.id)
                .putExtra("vehicle_label", v.displayName)
                .apply { if (type != null) putExtra("service_type", type) },
        )
    }
}
