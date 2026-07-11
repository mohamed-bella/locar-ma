package com.rentiq.system.ui.fleet

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.rentiq.system.R
import com.rentiq.system.data.repository.OperationResult
import com.rentiq.system.data.repository.OperationsRepository
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.ui.common.VehicleCardItem
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException

class FleetFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val repository = OperationsRepository()
    private val adapter = FleetAdapter { item ->
        startActivity(
            Intent(requireContext(), VehicleDetailActivity::class.java)
                .putExtra("vehicle_id", item.id),
        )
    }

    private var allItems: List<VehicleCardItem> = emptyList()
    private var selectedFilter = FILTER_ALL
    private var query = ""
    private var loading = false
    private var lastLoadedAt = 0L

    private val filterOptions = listOf(
        FilterPills.Option("Toutes", FILTER_ALL),
        FilterPills.Option("Attention", FILTER_ATTENTION),
        FilterPills.Option("Disponibles", "available"),
        FilterPills.Option("Louées", "rented"),
        FilterPills.Option("Réservées", "reserved"),
        FilterPills.Option("Maintenance", "maintenance"),
    )

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View {
        _binding = FragmentListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.listTitle.setText(R.string.fleet_title)
        binding.listSubtitle.setText(R.string.fleet_subtitle)
        binding.searchContainer.visibility = View.VISIBLE
        binding.searchInput.setHint(R.string.search_fleet_hint)
        binding.resultSummary.visibility = View.VISIBLE
        binding.emptyIcon.setImageResource(R.drawable.ic_car)
        binding.addButton.visibility = View.VISIBLE

        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter
        binding.swipeRefresh.setColorSchemeResources(R.color.navy)
        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.retryButton.setOnClickListener { load() }
        binding.addButton.setOnClickListener {
            startActivity(Intent(requireContext(), VehicleFormActivity::class.java))
        }
        binding.searchInput.doAfterTextChanged {
            query = it?.toString().orEmpty()
            applyFilters()
        }
        buildFilters()
        load()
    }

    override fun onResume() {
        super.onResume()
        if (_binding != null && System.currentTimeMillis() - lastLoadedAt > 1_500L) load()
    }

    private fun load() {
        if (loading) return
        loading = true
        binding.progressBar.visibility = if (adapter.itemCount == 0) View.VISIBLE else View.GONE
        binding.emptyView.visibility = View.GONE
        binding.retryButton.visibility = View.GONE

        viewLifecycleOwner.lifecycleScope.launch {
            val result = try {
                repository.loadFleet()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                OperationResult.Failure(null, e.message ?: "Connexion impossible")
            }
            loading = false
            lastLoadedAt = System.currentTimeMillis()
            binding.swipeRefresh.isRefreshing = false
            binding.progressBar.visibility = View.GONE

            when (result) {
                is OperationResult.Success -> {
                    val issuesByVehicle = result.value.issues
                        .filter { it.status != "resolved" && it.status != "closed" }
                        .groupBy { it.vehicleId }
                    allItems = result.value.vehicles
                        .map { VehicleCardItem(it, issuesByVehicle[it.id].orEmpty()) }
                        .sortedWith(compareBy<VehicleCardItem> { it.priority() }.thenBy { it.vehicle.displayName })
                    binding.filterBar.visibility = View.VISIBLE
                    applyFilters()
                }
                is OperationResult.Failure -> {
                    if (result.code == 401 || result.code == 403) AuthSession.returnToLogin(requireContext())
                    else showError(result.message)
                }
            }
        }
    }

    private fun buildFilters() {
        val counts = filterOptions.associate { option ->
            option.value to allItems.count { matchesFilter(it, option.value ?: FILTER_ALL) }
        }
        FilterPills.build(
            requireContext(),
            binding.filterChips,
            filterOptions,
            selectedFilter,
            counts,
        ) { value ->
            selectedFilter = value ?: FILTER_ALL
            applyFilters()
        }
    }

    private fun applyFilters() {
        if (_binding == null) return
        buildFilters()
        val filtered = allItems.filter { matchesFilter(it, selectedFilter) && it.matches(query) }
        adapter.submitList(filtered)

        val attention = allItems.count { it.attentionReasons.isNotEmpty() }
        val available = allItems.count { it.vehicle.status == "available" }
        binding.resultSummary.text = "${filtered.size} véhicule${if (filtered.size > 1) "s" else ""} · $available disponible${if (available > 1) "s" else ""} · $attention à vérifier"

        binding.emptyView.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
        if (filtered.isEmpty()) {
            binding.emptyTitle.setText(R.string.fleet_empty_title)
            binding.emptyText.text = when {
                allItems.isEmpty() -> getString(R.string.empty_fleet)
                query.isNotBlank() -> "Aucune voiture ne correspond à votre recherche."
                else -> "Aucune voiture dans ce filtre."
            }
            binding.retryButton.visibility = View.GONE
        }
    }

    private fun matchesFilter(item: VehicleCardItem, filter: String): Boolean = when (filter) {
        FILTER_ALL -> true
        FILTER_ATTENTION -> item.attentionReasons.isNotEmpty()
        "rented" -> item.vehicle.status == "rented" || item.vehicle.status == "active"
        else -> item.vehicle.status == filter
    }

    private fun showError(message: String) {
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyTitle.setText(R.string.list_error_title)
        binding.emptyText.text = message
        binding.retryButton.visibility = View.VISIBLE
    }

    override fun onDestroyView() {
        super.onDestroyView()
        loading = false
        _binding = null
    }

    companion object {
        private const val FILTER_ALL = "all"
        private const val FILTER_ATTENTION = "attention"
    }
}
