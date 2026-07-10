package com.rentiq.system.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.AgencyProfile
import com.rentiq.system.databinding.FragmentSettingsBinding
import com.rentiq.system.service.RealtimeService
import com.rentiq.system.ui.clients.ClientsActivity
import com.rentiq.system.ui.reports.ReportsActivity
import com.rentiq.system.ui.suivi.SuiviActivity
import com.rentiq.system.util.R2Uploader
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private lateinit var session: SessionManager
    private var agency: AgencyProfile? = null
    private var selectedAsset: BrandAsset = BrandAsset.LOGO
    private var logoUrl: String? = null
    private var stampUrl: String? = null

    private val pickBrandImage = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) uploadBrandAsset(uri, selectedAsset)
    }

    private val requestPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) applyNotifPrefs(true)
        else {
            binding.notifEnabled.setOnCheckedChangeListener(null)
            binding.notifEnabled.isChecked = false
            setupNotifListeners()
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        session = SessionManager(requireContext())
        binding.saveButton.setOnClickListener { save() }
        binding.openSuivi.setOnClickListener {
            startActivity(Intent(requireContext(), SuiviActivity::class.java))
        }
        binding.openClients.setOnClickListener {
            startActivity(Intent(requireContext(), ClientsActivity::class.java))
        }
        binding.openReports.setOnClickListener {
            startActivity(Intent(requireContext(), ReportsActivity::class.java))
        }
        binding.changeLogoButton.setOnClickListener { pickAsset(BrandAsset.LOGO) }
        binding.changeStampButton.setOnClickListener { pickAsset(BrandAsset.STAMP) }
        binding.removeLogoButton.setOnClickListener { updateBrandAsset(BrandAsset.LOGO, null) }
        binding.removeStampButton.setOnClickListener { updateBrandAsset(BrandAsset.STAMP, null) }
        loadNotifPrefs()
        setupNotifListeners()
        load()
    }

    // ── Notifications ───────────────────────────────────────────────────────

    private fun loadNotifPrefs() {
        val prefs = requireContext().getSharedPreferences(RealtimeService.PREF_FILE, android.content.Context.MODE_PRIVATE)
        binding.notifEnabled.isChecked = prefs.getBoolean(RealtimeService.KEY_ENABLED, true)
        binding.notifReservations.isChecked = prefs.getBoolean(RealtimeService.KEY_RESERVATIONS, true)
        binding.notifSignatures.isChecked = prefs.getBoolean(RealtimeService.KEY_SIGNATURES, true)
        binding.notifContracts.isChecked = prefs.getBoolean(RealtimeService.KEY_CONTRACTS, true)
        binding.notifVehicles.isChecked = prefs.getBoolean(RealtimeService.KEY_VEHICLES, true)
        binding.notifSuivi.isChecked = prefs.getBoolean(RealtimeService.KEY_SUIVI, true)
        binding.notifIssues.isChecked = prefs.getBoolean(RealtimeService.KEY_ISSUES, true)
        setNotificationCategoryEnabled(binding.notifEnabled.isChecked)
    }

    private fun setupNotifListeners() {
        binding.notifEnabled.setOnCheckedChangeListener { _, checked ->
            setNotificationCategoryEnabled(checked)
            if (checked) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
                ) {
                    requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    return@setOnCheckedChangeListener
                }
            }
            applyNotifPrefs(checked)
        }
        binding.notifReservations.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_RESERVATIONS, checked)
        }
        binding.notifSignatures.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_SIGNATURES, checked)
        }
        binding.notifContracts.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_CONTRACTS, checked)
        }
        binding.notifVehicles.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_VEHICLES, checked)
        }
        binding.notifSuivi.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_SUIVI, checked)
        }
        binding.notifIssues.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_ISSUES, checked)
        }
    }

    private fun setNotificationCategoryEnabled(enabled: Boolean) {
        binding.notifReservations.isEnabled = enabled
        binding.notifSignatures.isEnabled = enabled
        binding.notifContracts.isEnabled = enabled
        binding.notifVehicles.isEnabled = enabled
        binding.notifSuivi.isEnabled = enabled
        binding.notifIssues.isEnabled = enabled
    }

    private fun applyNotifPrefs(enabled: Boolean) {
        saveNotifPref(RealtimeService.KEY_ENABLED, enabled)
        val intent = Intent(requireContext(), RealtimeService::class.java)
        if (enabled) {
            intent.action = RealtimeService.ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                requireContext().startForegroundService(intent)
            } else {
                requireContext().startService(intent)
            }
        } else {
            intent.action = RealtimeService.ACTION_STOP
            requireContext().startService(intent)
        }
    }

    private fun saveNotifPref(key: String, value: Boolean) {
        requireContext().getSharedPreferences(RealtimeService.PREF_FILE, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(key, value).apply()
    }

    // ── Agency settings ─────────────────────────────────────────────────────

    private fun load() {
        val agencyId = session.agencyId ?: return
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getAgency("eq.$agencyId")
                if (res.isSuccessful && res.body() != null) {
                    agency = res.body()
                    render(res.body()!!)
                } else {
                    Toast.makeText(requireContext(), "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun render(a: AgencyProfile) {
        logoUrl = a.logoUrl
        stampUrl = a.stampUrl
        binding.title.text = a.name ?: "Agence"
        binding.role.text = a.city ?: a.slug ?: ""
        binding.agencyName.setText(a.name.orEmpty())
        binding.whatsappNumber.setText(a.whatsappNumber.orEmpty())
        binding.whatsappEnabled.isChecked = a.whatsappEnabled != false
        binding.legalName.setText(a.legalName.orEmpty())
        binding.companyPhone.setText(a.companyPhone.orEmpty())
        binding.address.setText(a.address.orEmpty())
        binding.ice.setText(a.ice.orEmpty())
        binding.rc.setText(a.rc.orEmpty())
        binding.rib.setText(a.rib.orEmpty())
        if (!a.logoUrl.isNullOrBlank()) {
            binding.logo.load(a.logoUrl)
            binding.logoPreview.load(a.logoUrl)
        } else {
            binding.logo.setImageDrawable(null)
            binding.logoPreview.setImageDrawable(null)
        }
        if (!a.stampUrl.isNullOrBlank()) {
            binding.stampPreview.load(a.stampUrl)
        } else {
            binding.stampPreview.setImageDrawable(null)
        }
        binding.removeLogoButton.visibility = if (a.logoUrl.isNullOrBlank()) View.GONE else View.VISIBLE
        binding.removeStampButton.visibility = if (a.stampUrl.isNullOrBlank()) View.GONE else View.VISIBLE
    }

    private fun save() {
        val agencyId = session.agencyId ?: return
        binding.progress.visibility = View.VISIBLE
        binding.saveButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val body = mapOf(
                    "name" to binding.agencyName.text.toString().trim().ifBlank { agency?.name ?: "Agence" },
                    "whatsapp_number" to nullable(binding.whatsappNumber.text.toString()),
                    "whatsapp_enabled" to binding.whatsappEnabled.isChecked,
                    "legal_name" to nullable(binding.legalName.text.toString()),
                    "company_phone" to nullable(binding.companyPhone.text.toString()),
                    "address" to nullable(binding.address.text.toString()),
                    "ice" to nullable(binding.ice.text.toString()),
                    "rc" to nullable(binding.rc.text.toString()),
                    "rib" to nullable(binding.rib.text.toString()),
                    "logo_url" to logoUrl,
                    "stamp_url" to stampUrl,
                )
                val res = SupabaseClient.rest.updateAgency("eq.$agencyId", body)
                if (res.isSuccessful) {
                    Toast.makeText(requireContext(), "Paramètres enregistrés", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progress.visibility = View.GONE
                binding.saveButton.isEnabled = true
            }
        }
    }

    private fun pickAsset(asset: BrandAsset) {
        selectedAsset = asset
        pickBrandImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    private fun uploadBrandAsset(uri: Uri, asset: BrandAsset) {
        val folder = if (asset == BrandAsset.LOGO) "agency/logos" else "agency/stamps"
        binding.progress.visibility = View.VISIBLE
        setBrandButtonsEnabled(false)
        lifecycleScope.launch {
            try {
                val publicUrl = R2Uploader.uploadPublicImage(requireContext(), uri, folder)
                if (publicUrl.isNullOrBlank()) {
                    Toast.makeText(requireContext(), "Echec upload image", Toast.LENGTH_SHORT).show()
                } else {
                    updateBrandAsset(asset, publicUrl)
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Erreur upload: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progress.visibility = View.GONE
                setBrandButtonsEnabled(true)
            }
        }
    }

    private fun updateBrandAsset(asset: BrandAsset, publicUrl: String?) {
        val agencyId = session.agencyId ?: return
        binding.progress.visibility = View.VISIBLE
        setBrandButtonsEnabled(false)
        lifecycleScope.launch {
            try {
                val field = if (asset == BrandAsset.LOGO) "logo_url" else "stamp_url"
                val res = SupabaseClient.rest.updateAgency("eq.$agencyId", mapOf(field to publicUrl))
                if (res.isSuccessful) {
                    if (asset == BrandAsset.LOGO) logoUrl = publicUrl else stampUrl = publicUrl
                    Toast.makeText(requireContext(), "Identite visuelle mise a jour", Toast.LENGTH_SHORT).show()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.progress.visibility = View.GONE
                setBrandButtonsEnabled(true)
            }
        }
    }

    private fun setBrandButtonsEnabled(enabled: Boolean) {
        binding.changeLogoButton.isEnabled = enabled
        binding.changeStampButton.isEnabled = enabled
        binding.removeLogoButton.isEnabled = enabled
        binding.removeStampButton.isEnabled = enabled
        binding.saveButton.isEnabled = enabled
    }

    private fun nullable(value: String): String? = value.trim().ifBlank { null }

    private enum class BrandAsset { LOGO, STAMP }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
