package com.rentiq.system.ui.suivi

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.ui.common.VehicleCardItem
import com.rentiq.system.ui.common.buildAttentionReasons
import com.rentiq.system.ui.fleet.LogServiceActivity
import com.rentiq.system.ui.fleet.VehicleDetailActivity
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException

class SuiviFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val adapter = SuiviAdapter(
        onOpen = { vehicle ->
            startActivity(Intent(requireContext(), VehicleDetailActivity::class.java).putExtra("vehicle_id", vehicle.id))
        },
        onAddService = { vehicle ->
            startActivity(
                Intent(requireContext(), LogServiceActivity::class.java)
                    .putExtra("vehicle_id", vehicle.id)
                    .putExtra("vehicle_label", vehicle.displayName)
            )
        }
    )
    private var allVehicles: List<Vehicle> = emptyList()
    private var query = ""
    private var selectedFilter = "due"
    private var loading = false
    private var lastLoadedAt = 0L

    private val filterOptions = listOf(
        FilterPills.Option("À faire", "due"),
        FilterPills.Option("Toutes", "all"),
    )

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.listTitle.setText(R.string.suivi_title)
        binding.listSubtitle.text = "Échéances et historique d’entretien"
        binding.searchContainer.visibility = View.VISIBLE
        binding.searchInput.hint = "Voiture ou plaque"
        binding.resultSummary.visibility = View.VISIBLE
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter
        binding.swipeRefresh.setColorSchemeResources(R.color.navy)
        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.retryButton.setOnClickListener { load() }
        binding.addButton.visibility = View.VISIBLE
        binding.addButton.setOnClickListener {
            startActivity(Intent(requireContext(), LogServiceActivity::class.java))
        }
        binding.emptyIcon.setImageResource(R.drawable.ic_suivi)
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

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getVehicles()
                loading = false
                lastLoadedAt = System.currentTimeMillis()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(requireContext())
                } else if (res.isSuccessful) {
                    allVehicles = (res.body() ?: emptyList()).sortedWith(
                        compareBy<Vehicle> { buildAttentionReasons(it, emptyList()).isEmpty() }
                            .thenBy { score(it) },
                    )
                    binding.filterBar.visibility = View.VISIBLE
                    applyFilters()
                } else {
                    showError(AuthSession.messageFor(res.code()))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                loading = false
                lastLoadedAt = System.currentTimeMillis()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError(e.message ?: "Erreur de chargement")
            }
        }
    }

    private fun buildFilters() {
        val counts = mapOf<String?, Int>(
            "due" to allVehicles.count { buildAttentionReasons(it, emptyList()).isNotEmpty() },
            "all" to allVehicles.size,
        )
        FilterPills.build(
            requireContext(),
            binding.filterChips,
            filterOptions,
            selectedFilter,
            counts,
        ) { value ->
            selectedFilter = value ?: "due"
            applyFilters()
        }
    }

    private fun applyFilters() {
        if (_binding == null) return
        buildFilters()
        val filtered = allVehicles.filter { vehicle ->
            val due = buildAttentionReasons(vehicle, emptyList()).isNotEmpty()
            (selectedFilter == "all" || due) && VehicleCardItem(vehicle, emptyList()).matches(query)
        }
        adapter.submitList(filtered)
        val due = allVehicles.count { buildAttentionReasons(it, emptyList()).isNotEmpty() }
        binding.resultSummary.text = "${filtered.size} voiture${if (filtered.size > 1) "s" else ""} · $due à vérifier"
        binding.emptyView.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
        if (filtered.isEmpty()) {
            binding.emptyTitle.setText(R.string.suivi_empty_title)
            binding.emptyText.text = when {
                allVehicles.isEmpty() -> getString(R.string.empty_fleet)
                query.isNotBlank() -> "Aucune voiture ne correspond à votre recherche."
                else -> "Aucune échéance proche. Consultez Toutes pour l’historique."
            }
            binding.retryButton.visibility = View.GONE
        }
    }

    private fun score(v: com.rentiq.system.data.model.Vehicle): Long {
        val now = java.time.LocalDate.now()
        val days = listOfNotNull(v.insuranceExpiry, v.vignetteExpiry, v.visiteTechExpiry).mapNotNull {
            runCatching { java.time.temporal.ChronoUnit.DAYS.between(now, java.time.LocalDate.parse(it.take(10))) }.getOrNull()
        }
        val dayScore = days.minOrNull() ?: Long.MAX_VALUE
        val oilScore = v.oilChangeLastKm?.let { lastKm ->
            ((v.oilChangeIntervalKm ?: 10000) - ((v.mileage ?: 0) - lastKm)).toLong()
        } ?: Long.MAX_VALUE
        return minOf(dayScore, oilScore)
    }

    private fun showError(msg: String) {
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyTitle.text = getString(R.string.list_error_title)
        binding.emptyText.text = msg
        binding.retryButton.visibility = View.VISIBLE
    }

    override fun onDestroyView() {
        super.onDestroyView()
        loading = false
        _binding = null
    }
}
