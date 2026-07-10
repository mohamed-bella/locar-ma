package com.rentiq.system.ui.fleet

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch

class FleetFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val adapter = FleetAdapter { vehicle ->
        startActivity(
            Intent(requireContext(), VehicleDetailActivity::class.java)
                .putExtra("vehicle_id", vehicle.id)
        )
    }
    private var allVehicles: List<Vehicle> = emptyList()
    private var statusFilter: String? = null

    private val filterOptions = listOf(
        FilterPills.Option("Toutes", null),
        FilterPills.Option("Disponibles", "available"),
        FilterPills.Option("Louées", "rented"),
        FilterPills.Option("Réservées", "reserved"),
        FilterPills.Option("Maintenance", "maintenance"),
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
            startActivity(Intent(requireContext(), VehicleFormActivity::class.java))
        }
        binding.emptyIcon.setImageResource(R.drawable.ic_car)
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

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicles()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE

                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(requireContext())
                } else if (res.isSuccessful) {
                    allVehicles = res.body() ?: emptyList()
                    binding.filterBar.visibility = if (allVehicles.isEmpty()) View.GONE else View.VISIBLE
                    applyFilter()
                } else {
                    showError(AuthSession.messageFor(res.code()))
                }
            } catch (e: Exception) {
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError()
            }
        }
    }

    private fun setupFilters() {
        val counts = mutableMapOf<String?, Int>(null to allVehicles.size)
        filterOptions.forEach { opt ->
            val s = opt.value ?: return@forEach
            counts[s] = allVehicles.count { it.status == s || (s == "rented" && it.status == "active") }
        }
        FilterPills.build(requireContext(), binding.filterChips, filterOptions, statusFilter, counts) { value ->
            statusFilter = value
            applyFilter()
        }
    }

    private fun applyFilter() {
        setupFilters()
        val filtered = statusFilter?.let { s ->
            allVehicles.filter { it.status == s || (s == "rented" && it.status == "active") }
        } ?: allVehicles
        adapter.submitList(filtered)
        if (filtered.isEmpty()) {
            binding.emptyView.visibility = View.VISIBLE
            binding.emptyTitle.text = getString(R.string.fleet_empty_title)
            binding.retryButton.visibility = View.GONE
            binding.emptyText.text =
                if (allVehicles.isEmpty()) getString(R.string.empty_fleet) else "Aucun résultat pour ce filtre"
        } else {
            binding.emptyView.visibility = View.GONE
        }
    }

    private fun showError(msg: String = "Erreur de chargement") {
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyTitle.text = getString(R.string.list_error_title)
        binding.emptyText.text = msg
        binding.retryButton.visibility = View.VISIBLE
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
