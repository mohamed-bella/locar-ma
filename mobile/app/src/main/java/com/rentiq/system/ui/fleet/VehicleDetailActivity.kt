package com.rentiq.system.ui.fleet

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ImageView
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
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ActivityVehicleDetailBinding
import com.rentiq.system.ui.reservations.NewReservationActivity
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.format.DateTimeFormatter

class VehicleDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleDetailBinding
    private val historyAdapter = ServiceRecordAdapter()
    private val issueAdapter = VehicleIssueAdapter { issue -> confirmResolveIssue(issue) }
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
