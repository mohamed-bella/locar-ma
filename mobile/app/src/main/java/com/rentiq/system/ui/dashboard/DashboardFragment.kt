package com.rentiq.system.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.FragmentDashboardBinding
import com.rentiq.system.ui.reservations.NewReservationActivity
import com.rentiq.system.ui.suivi.SuiviActivity
import com.rentiq.system.util.SessionManager
import com.rentiq.system.widget.DashboardWidgetProvider
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.WeekFields
import java.util.Locale

class DashboardFragment : Fragment() {
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.newReservation.setOnClickListener {
            startActivity(Intent(requireContext(), NewReservationActivity::class.java))
        }
        binding.openSuivi.setOnClickListener {
            startActivity(Intent(requireContext(), SuiviActivity::class.java))
        }
        load()
    }

    override fun onResume() {
        super.onResume()
        if (_binding != null) load()
    }

    private fun load() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val vehiclesCall = async { SupabaseClient.rest.getVehicles() }
                val reservationsCall = async { SupabaseClient.rest.getReservations() }
                val agencyId = SessionManager(requireContext()).agencyId
                val agencyCall = agencyId?.let { async { SupabaseClient.rest.getAgency("eq.$it") } }
                val vehicles = vehiclesCall.await().body() ?: emptyList()
                val reservations = reservationsCall.await().body() ?: emptyList()
                val agencyName = agencyCall?.await()?.body()?.name ?: "Agence"
                render(agencyName, vehicles, reservations)
            } catch (e: Exception) {
                binding.subtitle.text = e.message ?: "Erreur de chargement"
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun render(agencyName: String, vehicles: List<Vehicle>, reservations: List<Reservation>) {
        val today = LocalDate.now()
        val week = WeekFields.of(Locale.getDefault()).weekOfWeekBasedYear()
        var revToday = 0.0
        var revWeek = 0.0
        var revMonth = 0.0
        var pickups = 0
        var returns = 0
        // Aggregate revenue per vehicle id (so we can attach name + photo, not plate).
        val perVehicle = linkedMapOf<String, Double>()

        reservations.filter { it.status !in setOf("cancelled", "blocked", "pending") }.forEach { r ->
            val start = r.dateStart?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val end = r.dateEnd?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val amount = r.totalAmount ?: 0.0
            if (start != null) {
                if (start == today) revToday += amount
                if (start.get(week) == today.get(week) && start.year == today.year) revWeek += amount
                if (start.month == today.month && start.year == today.year) revMonth += amount
                if (start == today) pickups++
            }
            if (end == today && r.status in setOf("confirmed", "active")) returns++
            val vid = r.vehicleId ?: r.vehicles?.id
            if (vid != null) perVehicle[vid] = (perVehicle[vid] ?: 0.0) + amount
        }

        val available = vehicles.count { it.status == "available" }
        val rented = vehicles.count { it.status == "rented" || it.status == "active" }
        val maintenance = vehicles.count { it.status == "maintenance" }
        val reserved = vehicles.count { it.status == "reserved" }

        binding.greeting.text = getString(R.string.dashboard_title)
        binding.subtitle.text = "${vehicles.size} vehicules - ${reservations.size} reservations"
        binding.monthRevenue.text = money(revMonth)
        binding.weekRevenue.text = "${getString(R.string.finance_week)}\n${money(revWeek)}"
        binding.todayRevenue.text = "${getString(R.string.finance_today)}\n${money(revToday)}"
        binding.pickups.text = "${getString(R.string.pickups_today)}\n$pickups"
        binding.returns.text = "${getString(R.string.returns_today)}\n$returns"
        binding.fleetStatus.text = "Disponibles: $available - Louees: $rented - Reservees: $reserved - Maintenance: $maintenance"
        renderFinancePerCar(perVehicle, vehicles.associateBy { it.id })
        DashboardWidgetProvider.saveStats(requireContext(), agencyName, revMonth, pickups, returns, available, rented)
    }

    private fun renderFinancePerCar(perVehicle: Map<String, Double>, vehicleById: Map<String, Vehicle>) {
        val container = binding.financePerCarList
        container.removeAllViews()
        val top = perVehicle.entries.sortedByDescending { it.value }.take(6)
        binding.financeEmpty.visibility = if (top.isEmpty()) View.VISIBLE else View.GONE
        val max = top.maxOfOrNull { it.value }?.coerceAtLeast(1.0) ?: 1.0
        val inflater = LayoutInflater.from(requireContext())
        top.forEach { (vid, amount) ->
            val row = com.rentiq.system.databinding.ItemFinanceCarBinding.inflate(inflater, container, false)
            val v = vehicleById[vid]
            row.carName.text = v?.displayName ?: "Véhicule"
            row.carAmount.text = money(amount)
            val frac = (amount / max).toFloat().coerceIn(0.03f, 1f)
            (row.barFill.layoutParams as android.widget.LinearLayout.LayoutParams).weight = frac
            (row.barEmpty.layoutParams as android.widget.LinearLayout.LayoutParams).weight = 1f - frac
            v?.imageKeys?.firstOrNull()?.let { key ->
                row.carImg.load("${com.rentiq.system.BuildConfig.R2_PUBLIC_URL}/$key")
            }
            container.addView(row.root)
        }
    }

    private fun money(value: Double): String = "${value.toInt()} DH"

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
