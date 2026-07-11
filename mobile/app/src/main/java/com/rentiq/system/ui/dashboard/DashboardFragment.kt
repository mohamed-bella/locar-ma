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
import com.rentiq.system.data.model.Contract
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.FragmentDashboardBinding
import com.rentiq.system.ui.clients.ClientsActivity
import com.rentiq.system.ui.main.MainActivity
import com.rentiq.system.ui.reports.ReportsActivity
import com.rentiq.system.ui.reservations.NewReservationActivity
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.SessionManager
import com.rentiq.system.ui.common.buildAttentionReasons
import com.rentiq.system.widget.DashboardWidgetProvider
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import java.time.LocalDate
import java.time.temporal.WeekFields
import java.time.format.DateTimeFormatter
import java.util.Locale

class DashboardFragment : Fragment() {
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!
    private var loading = false
    private var lastLoadedAt = 0L

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.newReservation.setOnClickListener {
            startActivity(Intent(requireContext(), NewReservationActivity::class.java))
        }
        // Only Clients + Reports have no bottom-nav tab, so they keep a card here.
        // Fleet / Reservations / Suivi are reached from the bottom nav directly.
        binding.ctaFinance.setOnClickListener { startActivity(Intent(requireContext(), ReportsActivity::class.java)) }
        binding.ctaClients.setOnClickListener { startActivity(Intent(requireContext(), ClientsActivity::class.java)) }
        // Today's pickups / returns → the reservations planning.
        binding.pickupsCard.setOnClickListener { (activity as? MainActivity)?.navigateTo(R.id.nav_reservations) }
        binding.returnsCard.setOnClickListener { (activity as? MainActivity)?.navigateTo(R.id.nav_reservations) }
        // attentionCard listener is (re)bound in renderAttention with a smart destination.
        load()
    }

    override fun onResume() {
        super.onResume()
        if (_binding != null && System.currentTimeMillis() - lastLoadedAt > 1_500L) load()
    }

    private fun load() {
        if (loading) return
        loading = true
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val vehiclesCall = async { SupabaseClient.rest.getVehicles() }
                val reservationsCall = async { SupabaseClient.rest.getReservations() }
                val contractsCall = async { SupabaseClient.rest.getContracts() }
                val issuesCall = async { SupabaseClient.rest.getAllVehicleIssues() }
                val agencyId = SessionManager(requireContext()).agencyId
                val agencyCall = agencyId?.let { async { SupabaseClient.rest.getAgency("eq.$it") } }
                val vehiclesRes = vehiclesCall.await()
                val reservationsRes = reservationsCall.await()
                val contractsRes = contractsCall.await()
                val issuesRes = issuesCall.await()
                if (
                    AuthSession.isAuthError(vehiclesRes.code()) ||
                    AuthSession.isAuthError(reservationsRes.code()) ||
                    AuthSession.isAuthError(contractsRes.code()) ||
                    AuthSession.isAuthError(issuesRes.code())
                ) {
                    AuthSession.returnToLogin(requireContext())
                    return@launch
                }
                val agencyRes = agencyCall?.await()
                if (agencyRes != null && AuthSession.isAuthError(agencyRes.code())) {
                    AuthSession.returnToLogin(requireContext())
                    return@launch
                }
                if (!vehiclesRes.isSuccessful || !reservationsRes.isSuccessful || !contractsRes.isSuccessful || !issuesRes.isSuccessful) {
                    binding.subtitle.text = AuthSession.messageFor(
                        when {
                            !vehiclesRes.isSuccessful -> vehiclesRes.code()
                            !reservationsRes.isSuccessful -> reservationsRes.code()
                            !contractsRes.isSuccessful -> contractsRes.code()
                            else -> issuesRes.code()
                        }
                    )
                    return@launch
                }
                val vehicles = vehiclesRes.body() ?: emptyList()
                val reservations = reservationsRes.body() ?: emptyList()
                val contracts = contractsRes.body() ?: emptyList()
                val issues = issuesRes.body() ?: emptyList()
                val agencyName = agencyRes?.body()?.name ?: "Agence"
                render(agencyName, vehicles, reservations, contracts, issues)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _binding?.subtitle?.text = e.message ?: "Erreur de chargement"
            } finally {
                loading = false
                lastLoadedAt = System.currentTimeMillis()
                _binding?.progress?.visibility = View.GONE
            }
        }
    }

    private fun render(
        agencyName: String,
        vehicles: List<Vehicle>,
        reservations: List<Reservation>,
        contracts: List<Contract>,
        issues: List<VehicleIssue>,
    ) {
        val today = LocalDate.now()
        val week = WeekFields.of(Locale.getDefault()).weekOfWeekBasedYear()
        var revToday = 0.0
        var revWeek = 0.0
        var revMonth = 0.0
        var pickups = 0
        var returns = 0
        // Aggregate revenue per vehicle id (so we can attach name + photo, not plate).
        val perVehicle = linkedMapOf<String, Double>()

        reservations.filter { it.status != "cancelled" && it.status != "blocked" && it.status != "pending" }.forEach { r ->
            val start = r.dateStart?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val end = r.dateEnd?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            val amount = r.totalAmount ?: 0.0
            if (start != null) {
                if (start == today) revToday += amount
                if (start.get(week) == today.get(week) && start.year == today.year) revWeek += amount
                if (start.month == today.month && start.year == today.year) revMonth += amount
                if (start == today) pickups++
            }
            if (end == today && (r.status == "confirmed" || r.status == "active")) returns++
            val vid = r.vehicleId ?: r.vehicles?.id
            if (vid != null) perVehicle[vid] = (perVehicle[vid] ?: 0.0) + amount
        }

        val available = vehicles.count { it.status == "available" }
        val rented = vehicles.count { it.status == "rented" || it.status == "active" }
        val maintenance = vehicles.count { it.status == "maintenance" }
        val reserved = vehicles.count { it.status == "reserved" }

        binding.greeting.text = "Aujourd’hui"
        binding.subtitle.text = "${today.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH)).replaceFirstChar { it.uppercase() }} · ${vehicles.size} voitures"
        binding.monthRevenue.text = money(revMonth)
        binding.weekRevenue.text = "${getString(R.string.finance_week)}\n${money(revWeek)}"
        binding.todayRevenue.text = "${getString(R.string.finance_today)}\n${money(revToday)}"
        binding.pickups.text = pickups.toString()
        binding.returns.text = returns.toString()
        binding.fleetStatus.text = "$available disponibles · $rented louées · $reserved réservées · $maintenance en maintenance"
        renderAttention(today, vehicles, reservations, contracts, issues)
        renderFinancePerCar(perVehicle, vehicles.associateBy { it.id })
        DashboardWidgetProvider.saveStats(requireContext(), agencyName, revMonth, pickups, returns, available, rented)
    }

    private fun renderAttention(
        today: LocalDate,
        vehicles: List<Vehicle>,
        reservations: List<Reservation>,
        contracts: List<Contract>,
        issues: List<VehicleIssue>,
    ) {
        // Only LIVE reservations create attention items. Once a reservation is
        // closed / cancelled / blocked / archived, its unsigned or missing
        // contract is history — don't nag about it on the dashboard.
        val liveStatuses = setOf("pending", "confirmed", "active")
        val overdueReturns = reservations.count { reservation ->
            reservation.status in liveStatuses && reservation.dateEnd?.take(10)?.let {
                runCatching { LocalDate.parse(it).isBefore(today) }.getOrDefault(false)
            } == true
        }
        val unsignedContracts = contracts.count { contract ->
            contract.signedAt == null && contract.closedAt == null &&
                contract.reservations?.status in liveStatuses &&
                contract.reservations?.dateStart?.take(10)?.let {
                    runCatching { !LocalDate.parse(it).isAfter(today.plusDays(30)) }.getOrDefault(false)
                } != false
        }
        val reservationIdsWithContract = contracts.mapNotNull { it.reservationId }.toSet()
        val missingContracts = reservations.count { reservation ->
            reservation.id !in reservationIdsWithContract &&
                reservation.status in liveStatuses &&
                reservation.dateStart?.take(10)?.let {
                    runCatching { !LocalDate.parse(it).isAfter(today.plusDays(7)) }.getOrDefault(false)
                } == true
        }
        val activeIssueCount = issues.count { it.status != "resolved" && it.status != "closed" }
        val issuesByVehicle = issues.groupBy { it.vehicleId }
        val complianceVehicles = vehicles.count { vehicle ->
            buildAttentionReasons(vehicle, issuesByVehicle[vehicle.id].orEmpty()).isNotEmpty()
        }
        val total = overdueReturns + unsignedContracts + missingContracts + complianceVehicles

        val details = listOfNotNull(
            overdueReturns.takeIf { it > 0 }?.let { "$it retour${if (it > 1) "s" else ""} en retard" },
            unsignedContracts.takeIf { it > 0 }?.let { "$it contrat${if (it > 1) "s" else ""} à signer" },
            missingContracts.takeIf { it > 0 }?.let { "$it contrat${if (it > 1) "s" else ""} à créer" },
            activeIssueCount.takeIf { it > 0 }?.let { "$it problème${if (it > 1) "s" else ""} ouvert${if (it > 1) "s" else ""}" },
            complianceVehicles.takeIf { it > 0 }?.let { "$it voiture${if (it > 1) "s" else ""} à vérifier" },
        )

        if (total == 0 && complianceVehicles == 0) {
            binding.attentionCount.text = "Rien d’urgent"
            binding.attentionText.text = "Les opérations sont à jour."
            binding.attentionCard.setCardBackgroundColor(requireContext().getColor(R.color.success_soft))
            binding.attentionCard.strokeColor = requireContext().getColor(R.color.green)
        } else {
            binding.attentionCount.text = "$total action${if (total > 1) "s" else ""} à traiter"
            binding.attentionText.text = details.joinToString(" · ")
            binding.attentionCard.setCardBackgroundColor(requireContext().getColor(R.color.warning_soft))
            binding.attentionCard.strokeColor = requireContext().getColor(R.color.booking_yellow)
        }

        binding.attentionCard.setOnClickListener {
            val destination = if (overdueReturns > 0 || unsignedContracts > 0 || missingContracts > 0) R.id.nav_reservations else R.id.nav_fleet
            (activity as? MainActivity)?.navigateTo(destination)
        }
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
        loading = false
        _binding = null
    }
}
