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
import com.rentiq.system.databinding.FragmentListBinding
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

                if (res.isSuccessful) {
                    val list = res.body() ?: emptyList()
                    adapter.submitList(list)
                    if (list.isEmpty()) {
                        binding.emptyView.visibility = View.VISIBLE
                        binding.emptyText.text = getString(R.string.empty_fleet)
                    }
                } else {
                    showError()
                }
            } catch (e: Exception) {
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError()
            }
        }
    }

    private fun showError() {
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyText.text = "Erreur de chargement"
        binding.retryButton.visibility = View.VISIBLE
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
