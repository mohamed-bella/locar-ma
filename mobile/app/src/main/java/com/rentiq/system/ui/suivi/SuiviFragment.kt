package com.rentiq.system.ui.suivi

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
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.ui.fleet.LogServiceActivity
import com.rentiq.system.ui.fleet.VehicleDetailActivity
import com.rentiq.system.util.AuthSession
import kotlinx.coroutines.launch

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
            startActivity(Intent(requireContext(), LogServiceActivity::class.java))
        }
        binding.emptyIcon.setImageResource(R.drawable.ic_suivi)
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
                val res = SupabaseClient.rest.getVehicles()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(requireContext())
                } else if (res.isSuccessful) {
                    val vehicles = (res.body() ?: emptyList()).sortedBy { score(it) }
                    adapter.submitList(vehicles)
                    if (vehicles.isEmpty()) {
                        binding.emptyView.visibility = View.VISIBLE
                        binding.emptyTitle.text = getString(R.string.suivi_empty_title)
                        binding.retryButton.visibility = View.GONE
                        binding.emptyText.text = getString(R.string.empty_fleet)
                    }
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
        _binding = null
    }
}
