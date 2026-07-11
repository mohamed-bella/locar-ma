package com.rentiq.system.ui.reservations

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch

class ReservationsFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val adapter = ReservationsAdapter(
        onCancel = { reservation -> confirmCancel(reservation) },
        onClick = { reservation ->
            startActivity(
                Intent(requireContext(), ReservationDetailActivity::class.java)
                    .putExtra("reservation_id", reservation.id)
            )
        },
    )
    private var allReservations: List<Reservation> = emptyList()
    private var statusFilter: String? = null

    private val filterOptions = listOf(
        FilterPills.Option("Toutes", null),
        FilterPills.Option("Confirmées", "confirmed"),
        FilterPills.Option("Actives", "active"),
        FilterPills.Option("Terminées", "closed"),
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter
        binding.swipeRefresh.setColorSchemeResources(R.color.navy)
        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.retryButton.setOnClickListener { load() }
        binding.addButton.visibility = View.VISIBLE
        binding.addButton.setOnClickListener {
            startActivity(Intent(requireContext(), NewReservationActivity::class.java))
        }
        binding.emptyIcon.setImageResource(R.drawable.ic_calendar)
        setupFilters()
        load()
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        binding.progressBar.visibility = if (adapter.itemCount == 0) View.VISIBLE else View.GONE
        binding.emptyView.visibility = View.GONE
        binding.retryButton.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val today = java.time.LocalDate.now()
                val windowStart = today.minusDays(14)
                val windowEnd = today.plusDays(120)
                val res = SupabaseClient.rest.getReservations(
                    dateStart = "lte.$windowEnd",
                    dateEnd = "gte.$windowStart",
                )
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(requireContext())
                } else if (res.isSuccessful) {
                    allReservations = sortByPriority(res.body() ?: emptyList())
                    binding.filterBar.visibility = if (allReservations.isEmpty()) View.GONE else View.VISIBLE
                    applyFilter()
                } else {
                    showError(AuthSession.messageFor(res.code()))
                }
            } catch (e: Exception) {
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError(e.message ?: "Erreur de chargement")
            }
        }
    }

    // Most actionable first: en location (soonest return) → à venir (soonest
    // pickup) → terminées (recent) → annulées.
    private fun sortByPriority(list: List<com.rentiq.system.data.model.Reservation>): List<com.rentiq.system.data.model.Reservation> {
        val today = java.time.LocalDate.now()
        fun parse(d: String?) = d?.take(10)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }
        fun rank(r: com.rentiq.system.data.model.Reservation): Int {
            val start = parse(r.dateStart)
            val end = parse(r.dateEnd)
            return when {
                r.status == "cancelled" -> 3
                r.status == "closed" -> 2
                start != null && today.isBefore(start) -> 1              // à venir
                else -> 0                                               // en location / now
            }
        }
        return list.sortedWith(
            compareBy<com.rentiq.system.data.model.Reservation> { rank(it) }
                .thenBy { r ->
                    // Secondary key: within each group, most urgent first.
                    val start = parse(r.dateStart)
                    val end = parse(r.dateEnd)
                    when (rank(r)) {
                        0 -> end?.toEpochDay() ?: Long.MAX_VALUE          // soonest return
                        1 -> start?.toEpochDay() ?: Long.MAX_VALUE        // soonest pickup
                        else -> -(end?.toEpochDay() ?: 0L)               // most recent first
                    }
                }
        )
    }

    private fun setupFilters() {
        val counts = mutableMapOf<String?, Int>(null to allReservations.size)
        filterOptions.forEach { opt ->
            if (opt.value != null) counts[opt.value] = allReservations.count { it.status == opt.value }
        }
        FilterPills.build(requireContext(), binding.filterChips, filterOptions, statusFilter, counts) { value ->
            statusFilter = value
            applyFilter()
        }
    }

    private fun applyFilter() {
        setupFilters()
        val filtered = statusFilter?.let { s -> allReservations.filter { it.status == s } } ?: allReservations
        adapter.submitList(filtered)
        if (filtered.isEmpty()) {
            binding.emptyView.visibility = View.VISIBLE
            binding.emptyTitle.text = getString(R.string.reservations_empty_title)
            binding.retryButton.visibility = View.GONE
            binding.emptyText.text =
                if (allReservations.isEmpty()) getString(R.string.empty_reservations) else "Aucun résultat pour ce filtre"
        } else {
            binding.emptyView.visibility = View.GONE
        }
    }

    private fun showError(msg: String) {
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyTitle.text = getString(R.string.list_error_title)
        binding.emptyText.text = msg
        binding.retryButton.visibility = View.VISIBLE
    }

    private fun confirmCancel(reservation: Reservation) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.soft_delete_reservation)
            .setMessage(R.string.confirm_cancel_reservation)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.soft_delete_reservation) { _, _ -> cancelReservation(reservation) }
            .show()
    }

    private fun cancelReservation(reservation: Reservation) {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.api.setReservationStatus(
                    mapOf("id" to reservation.id, "status" to "cancelled"),
                )
                binding.progressBar.visibility = View.GONE
                if (res.isSuccessful) {
                    Toast.makeText(requireContext(), R.string.reservation_cancelled, Toast.LENGTH_SHORT).show()
                    allReservations = allReservations.filterNot { it.id == reservation.id }
                    applyFilter()
                    load()
                } else {
                    Toast.makeText(requireContext(), "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Toast.makeText(requireContext(), "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
