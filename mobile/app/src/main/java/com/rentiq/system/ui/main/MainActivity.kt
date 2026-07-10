package com.rentiq.system.ui.main

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.google.android.material.tabs.TabLayoutMediator
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.databinding.ActivityMainBinding
import com.rentiq.system.ui.auth.LoginActivity
import com.rentiq.system.ui.contracts.ContractsFragment
import com.rentiq.system.ui.fleet.FleetFragment
import com.rentiq.system.ui.reservations.ReservationsFragment
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding

    private val tabs = listOf(
        R.string.tab_fleet to { FleetFragment() },
        R.string.tab_reservations to { ReservationsFragment() },
        R.string.tab_contracts to { ContractsFragment() },
        R.string.tab_suivi to { com.rentiq.system.ui.suivi.SuiviFragment() },
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)

        binding.viewPager.adapter = object : FragmentStateAdapter(this) {
            override fun getItemCount() = tabs.size
            override fun createFragment(pos: Int): Fragment = tabs[pos].second()
        }

        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, pos ->
            tab.text = getString(tabs[pos].first)
        }.attach()

        ensureAgencyId()
    }

    private fun ensureAgencyId() {
        val session = SessionManager(this)
        if (session.agencyId != null) return
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getMembers()
                val agencyId = res.body()?.firstOrNull()?.agencyId
                if (agencyId != null) session.agencyId = agencyId
            } catch (_: Exception) {}
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, R.string.logout)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == 1) {
            SessionManager(this).clear()
            SupabaseClient.accessToken = null
            startActivity(Intent(this, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
