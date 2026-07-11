package com.rentiq.system.ui.main

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.commit
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.R
import com.rentiq.system.data.api.RefreshRequest
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.databinding.ActivityMainBinding
import com.rentiq.system.service.RealtimeService
import com.rentiq.system.ui.auth.LoginActivity
import com.rentiq.system.ui.dashboard.DashboardFragment
import com.rentiq.system.ui.fleet.FleetFragment
import com.rentiq.system.ui.reservations.ReservationsFragment
import com.rentiq.system.ui.settings.SettingsFragment
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.NotificationHelper
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var session: SessionManager
    private var currentMenuId: Int? = null

    private val requestNotifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ ->
        // Regardless of outcome — start service if prefs say enabled (silent if denied)
        startRealtimeServiceIfEnabled()
    }

    private val destinations = listOf(
        Destination(R.id.nav_dashboard) { DashboardFragment() },
        Destination(R.id.nav_fleet) { FleetFragment() },
        Destination(R.id.nav_reservations) { ReservationsFragment() },
        Destination(R.id.nav_more) { MoreFragment() },
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)
        SupabaseClient.bindSession(applicationContext)
        val token = session.accessToken
        if (token.isNullOrBlank()) {
            goToLogin()
            return
        }
        SupabaseClient.accessToken = token
        refreshThenStart()
    }

    private fun refreshThenStart() {
        val refreshToken = session.refreshToken
        if (refreshToken.isNullOrBlank()) {
            setupUi()
            return
        }
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.auth.refresh(RefreshRequest(refreshToken))
                if (res.isSuccessful && res.body() != null) {
                    val body = res.body()!!
                    session.accessToken = body.accessToken
                    session.refreshToken = body.refreshToken
                    session.userId = body.user?.id ?: session.userId
                    SupabaseClient.accessToken = body.accessToken
                    setupUi()
                } else if (res.code() in 400..499) {
                    AuthSession.returnToLogin(this@MainActivity, showMessage = true)
                } else {
                    setupUi()
                }
            } catch (_: Exception) {
                setupUi()
            }
        }
    }

    private fun setupUi() {
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = ""

        binding.bottomNavigation.setOnItemSelectedListener { item ->
            val destination = destinations.firstOrNull { it.menuId == item.itemId }
                ?: return@setOnItemSelectedListener false
            showDestination(destination)
            true
        }
        binding.bottomNavigation.setOnItemReselectedListener { item ->
            destinations.firstOrNull { it.menuId == item.itemId }?.let {
                currentMenuId = null
                showDestination(it)
            }
        }
        binding.bottomNavigation.selectedItemId = R.id.nav_dashboard

        ensureAgencyId()
        loadAgencyBrand()
        maybeStartRealtimeService()
    }

    // Let child fragments (e.g. dashboard CTA cards) switch the active tab.
    fun navigateTo(menuId: Int) {
        if (::binding.isInitialized) binding.bottomNavigation.selectedItemId = menuId
    }

    private fun showDestination(destination: Destination) {
        if (currentMenuId == destination.menuId) return
        currentMenuId = destination.menuId
        supportFragmentManager.popBackStackImmediate(
            null,
            androidx.fragment.app.FragmentManager.POP_BACK_STACK_INCLUSIVE,
        )
        supportFragmentManager.commit {
            replace(R.id.fragmentContainer, destination.factory())
        }
        loadAgencyBrand()
    }

    private fun ensureAgencyId() {
        if (session.agencyId != null) return
        lifecycleScope.launch {
            try {
                val agencyId = AuthSession.ensureAgencyId(this@MainActivity)
                if (!agencyId.isNullOrBlank()) {
                    loadAgencyBrand()
                    maybeStartRealtimeService()
                }
            } catch (_: Exception) {
                // List screens still show their own retry state if network is unavailable.
            }
        }
    }

    private fun loadAgencyBrand() {
        val agencyId = session.agencyId ?: return
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getAgency("eq.$agencyId")
                if (res.isSuccessful && res.body() != null) {
                    val agency = res.body()!!
                    binding.agencyName.text = agency.name ?: getString(R.string.app_name)
                    if (!agency.logoUrl.isNullOrBlank()) {
                        binding.agencyLogo.imageTintList = null
                        binding.agencyLogo.load(agency.logoUrl)
                    }
                }
            } catch (_: Exception) {
                // Branding is decorative; lists remain responsible for their own errors.
            }
        }
    }

    fun openSettings() {
        currentMenuId = null
        supportFragmentManager.commit {
            replace(R.id.fragmentContainer, SettingsFragment())
            addToBackStack("settings")
        }
    }

    fun logout() {
        session.clear()
        SupabaseClient.accessToken = null
        goToLogin()
    }

    private fun maybeStartRealtimeService() {
        val prefs = getSharedPreferences(RealtimeService.PREF_FILE, MODE_PRIVATE)
        if (!prefs.getBoolean(RealtimeService.KEY_ENABLED, true)) return
        NotificationHelper.createChannels(this)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED -> startRealtimeServiceIfEnabled()
                else -> requestNotifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            startRealtimeServiceIfEnabled()
        }
    }

    private fun startRealtimeServiceIfEnabled() {
        val prefs = getSharedPreferences(RealtimeService.PREF_FILE, MODE_PRIVATE)
        if (!prefs.getBoolean(RealtimeService.KEY_ENABLED, true)) return
        val intent = Intent(this, RealtimeService::class.java).apply { action = RealtimeService.ACTION_START }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun goToLogin() {
        startActivity(Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })
        finish()
    }

    private data class Destination(
        val menuId: Int,
        val factory: () -> Fragment,
    )
}
