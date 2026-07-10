package com.rentiq.system.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
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
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private lateinit var session: SessionManager
    private var agency: AgencyProfile? = null

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
        binding.notifVehicles.isChecked = prefs.getBoolean(RealtimeService.KEY_VEHICLES, true)
        val subsEnabled = binding.notifEnabled.isChecked
        binding.notifReservations.isEnabled = subsEnabled
        binding.notifSignatures.isEnabled = subsEnabled
        binding.notifVehicles.isEnabled = subsEnabled
    }

    private fun setupNotifListeners() {
        binding.notifEnabled.setOnCheckedChangeListener { _, checked ->
            binding.notifReservations.isEnabled = checked
            binding.notifSignatures.isEnabled = checked
            binding.notifVehicles.isEnabled = checked
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
        binding.notifVehicles.setOnCheckedChangeListener { _, checked ->
            saveNotifPref(RealtimeService.KEY_VEHICLES, checked)
        }
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
        }
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

    private fun nullable(value: String): String? = value.trim().ifBlank { null }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
