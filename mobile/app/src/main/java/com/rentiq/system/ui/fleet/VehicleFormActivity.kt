package com.rentiq.system.ui.fleet

import android.app.DatePickerDialog
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ActivityVehicleFormBinding
import com.rentiq.system.util.R2Uploader
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Calendar

class VehicleFormActivity : AppCompatActivity() {
    private lateinit var b: ActivityVehicleFormBinding
    private var vehicleId: String? = null
    private var currentVehicle: Vehicle? = null
    private val imageKeys = mutableListOf<String>()

    private val categories = listOf("economy", "compact", "suv", "luxury", "utility")
    private val categoryLabels = listOf("Économique", "Compacte", "SUV", "Luxe", "Utilitaire")
    private val statuses   = listOf("available", "reserved", "rented", "maintenance")
    private val statusLabels = listOf("Disponible", "Réservée", "En location", "Maintenance")

    private val pickImages = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) uploadImages(uris) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityVehicleFormBinding.inflate(layoutInflater)
        setContentView(b.root)

        vehicleId = intent.getStringExtra("vehicle_id")
        b.toolbar.title = if (vehicleId == null) "Nouvelle voiture" else "Modifier voiture"
        b.toolbar.setNavigationOnClickListener { finish() }

        b.category.adapter = spinnerAdapter(categoryLabels)
        b.status.adapter   = spinnerAdapter(statusLabels)
        b.status.setSelection(statuses.indexOf("available"))
        b.status.isEnabled = false
        b.status.alpha = 0.7f

        listOf(b.insuranceExpiry, b.vignetteExpiry, b.visiteTechExpiry, b.oilLastDate).forEach { field ->
            field.setOnClickListener { pickDate(field) }
        }
        b.addImageButton.setOnClickListener {
            pickImages.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
        b.saveButton.setOnClickListener { save() }

        vehicleId?.let { load(it) }
    }

    // ── Image handling ──────────────────────────────────────────────────────

    private fun uploadImages(uris: List<Uri>) {
        b.imageProgress.visibility = View.VISIBLE
        b.addImageButton.isEnabled = false
        lifecycleScope.launch {
            try {
                if (uris.size > 8) toast("Les 8 premières photos seront ajoutées")
                val keys = uris.take(8).mapNotNull { uri ->
                    R2Uploader.uploadImage(this@VehicleFormActivity, uri)
                }
                if (keys.isEmpty()) {
                    toast("Échec upload images")
                } else {
                    keys.forEach { key ->
                        imageKeys.add(key)
                        addThumbFromUrl("${BuildConfig.R2_PUBLIC_URL}/$key", key)
                    }
                }
            } catch (e: Exception) {
                toast("Erreur: ${e.message}")
            } finally {
                b.imageProgress.visibility = View.GONE
                b.addImageButton.isEnabled = true
            }
        }
    }

    private fun addThumbFromUrl(url: String, key: String) {
        val sizePx = dp(86)
        val frame = FrameLayout(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(sizePx, sizePx).apply {
                marginEnd = dp(6)
            }
        }
        val img = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            scaleType = ImageView.ScaleType.CENTER_CROP
            load(url)
        }
        val close = ImageButton(this).apply {
            val btnSize = dp(24)
            layoutParams = FrameLayout.LayoutParams(btnSize, btnSize, Gravity.TOP or Gravity.END)
            setImageDrawable(ContextCompat.getDrawable(this@VehicleFormActivity, R.drawable.ic_close))
            setColorFilter(ContextCompat.getColor(this@VehicleFormActivity, R.color.white))
            background = null
            setOnClickListener {
                imageKeys.remove(key)
                b.imageContainer.removeView(frame)
            }
        }
        frame.addView(img)
        frame.addView(close)
        b.imageContainer.addView(frame)
    }

    // ── Load existing vehicle ───────────────────────────────────────────────

    private fun load(id: String) {
        setLoading(true)
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicle("eq.$id")
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(this@VehicleFormActivity)
                    return@launch
                }
                if (res.isSuccessful && res.body() != null) {
                    currentVehicle = res.body()!!
                    render(currentVehicle!!)
                } else {
                    toast("Erreur ${res.code()}")
                }
            } catch (e: Exception) {
                toast("Erreur: ${e.message}")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun render(v: Vehicle) {
        b.plate.setText(v.plate.orEmpty())
        b.brand.setText(v.brand.orEmpty())
        b.model.setText(v.model.orEmpty())
        b.year.setText(v.year?.toString().orEmpty())
        b.dailyRate.setText(v.dailyRate?.toInt()?.toString().orEmpty())
        b.mileage.setText(v.mileage?.toString().orEmpty())
        b.insuranceExpiry.setText(v.insuranceExpiry?.take(10).orEmpty())
        b.vignetteExpiry.setText(v.vignetteExpiry?.take(10).orEmpty())
        b.visiteTechExpiry.setText(v.visiteTechExpiry?.take(10).orEmpty())
        b.oilLastKm.setText(v.oilChangeLastKm?.toString().orEmpty())
        b.oilIntervalKm.setText((v.oilChangeIntervalKm ?: 10000).toString())
        b.oilLastDate.setText(v.oilChangeLastDate?.take(10).orEmpty())
        b.nextServiceNote.setText(v.nextServiceNote.orEmpty())
        b.notes.setText(v.notes.orEmpty())
        setSpinnerSelection(b.category, categories, v.category)
        setSpinnerSelection(b.status,   statuses,   v.status)

        // Load existing images
        b.imageContainer.removeAllViews()
        imageKeys.clear()
        v.imageKeys?.forEach { key ->
            imageKeys.add(key)
            addThumbFromUrl("${BuildConfig.R2_PUBLIC_URL}/$key", key)
        }
    }

    // ── Save ────────────────────────────────────────────────────────────────

    private fun save() {
        val plate = b.plate.text.toString().trim().uppercase()
        val rate  = b.dailyRate.text.toString().toDoubleOrNull()
        val mileage = b.mileage.text.toString().toIntOrNull() ?: 0
        if (plate.isBlank()) { toast("Immatriculation obligatoire"); return }
        if (rate == null || rate <= 0.0) { toast("Tarif journalier obligatoire"); return }
        if (mileage < 0) { toast("Kilométrage invalide"); return }
        if (currentVehicle?.mileage != null && mileage < currentVehicle!!.mileage!!) {
            toast("Le kilométrage ne peut pas diminuer (${currentVehicle!!.mileage} km actuellement)")
            return
        }

        val agencyId = SessionManager(this).agencyId
        if (vehicleId == null && agencyId.isNullOrBlank()) { toast("Agence non trouvée"); return }

        setLoading(true)
        lifecycleScope.launch {
            try {
                val id = vehicleId
                val payload = buildPayload(plate, rate)
                val res = if (id == null) {
                    SupabaseClient.api.createVehicle(payload)
                } else {
                    SupabaseClient.api.updateVehicle(payload + ("id" to id))
                }

                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(this@VehicleFormActivity)
                    return@launch
                }

                if (res.isSuccessful) {
                    toast("Voiture enregistrée")
                    setResult(RESULT_OK)
                    finish()
                } else {
                    toast("Erreur ${res.code()}")
                }
            } catch (e: Exception) {
                toast("Erreur: ${e.message}")
            } finally {
                setLoading(false)
            }
        }
    }

    private fun buildPayload(plate: String, rate: Double): Map<String, Any?> = mapOf(
        "plate"              to plate,
        "brand"              to nullable(b.brand.text.toString()),
        "model"              to nullable(b.model.text.toString()),
        "year"               to intOrNull(b.year),
        "category"           to selectedCategory(),
        "daily_rate"         to rate,
        "mileage_current"    to (intOrNull(b.mileage) ?: 0),
        "insurance_expiry"   to dateOrNull(b.insuranceExpiry),
        "vignette_expiry"    to dateOrNull(b.vignetteExpiry),
        "visite_tech_expiry" to dateOrNull(b.visiteTechExpiry),
        "oil_change_last_km" to intOrNull(b.oilLastKm),
        "oil_change_interval_km" to (intOrNull(b.oilIntervalKm) ?: 10000),
        "oil_change_last_date" to dateOrNull(b.oilLastDate),
        "next_service_note"  to nullable(b.nextServiceNote.text.toString()),
        "notes"              to nullable(b.notes.text.toString()),
        "image_keys"         to imageKeys.toList(),
    )

    // ── Helpers ─────────────────────────────────────────────────────────────

    private fun spinnerAdapter(values: List<String>) =
        ArrayAdapter(this, android.R.layout.simple_spinner_item, values).also {
            it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    private fun setSpinnerSelection(spinner: android.widget.Spinner, values: List<String>, value: String?) {
        val idx = values.indexOf(value)
        if (idx >= 0) spinner.setSelection(idx)
    }

    private fun pickDate(target: EditText) {
        val seed = target.text.toString().takeIf { it.isNotBlank() }?.let {
            runCatching { LocalDate.parse(it.take(10)) }.getOrNull()
        }
        val cal = Calendar.getInstance()
        seed?.let {
            cal.set(Calendar.YEAR,         it.year)
            cal.set(Calendar.MONTH,        it.monthValue - 1)
            cal.set(Calendar.DAY_OF_MONTH, it.dayOfMonth)
        }
        DatePickerDialog(this, { _, y, m, d ->
            target.setText(LocalDate.of(y, m + 1, d).toString())
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun selectedCategory() = categories.getOrNull(b.category.selectedItemPosition)
    private fun nullable(v: String): String? = v.trim().ifBlank { null }
    private fun intOrNull(f: EditText): Int? = f.text.toString().trim().toIntOrNull()
    private fun dateOrNull(f: EditText): String? = f.text.toString().trim().takeIf { it.isNotBlank() }
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun setLoading(loading: Boolean) {
        b.progress.visibility   = if (loading) View.VISIBLE else View.GONE
        b.saveButton.isEnabled  = !loading
    }
}
