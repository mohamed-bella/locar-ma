package com.rentiq.system.ui.fleet

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ActivityVehicleDetailBinding
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class VehicleDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleDetailBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityVehicleDetailBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        loadVehicle()
    }

    private fun loadVehicle() {
        val vehicleId = intent.getStringExtra("vehicle_id") ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicle("eq.$vehicleId")
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    res.body()?.let { bind(it) }
                } else {
                    Toast.makeText(this@VehicleDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@VehicleDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun bind(v: Vehicle) {
        b.toolbar.title = v.displayName
        b.vehicleName.text = v.displayName
        b.plate.text = v.plate ?: "—"

        val firstKey = v.imageKeys?.firstOrNull()
        if (firstKey != null) {
            b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$firstKey") {
                crossfade(true)
            }
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
            val daysLeft = java.time.temporal.ChronoUnit.DAYS.between(now, date)
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
