package com.rentiq.system.ui.contracts

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
import com.rentiq.system.data.model.Contract
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch

class ContractsFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val adapter = ContractsAdapter { contract ->
        startActivity(
            Intent(requireContext(), ContractDetailActivity::class.java)
                .putExtra("contract_id", contract.id)
        )
    }
    private var allContracts: List<Contract> = emptyList()
    private var stateFilter: String? = null

    private val filterOptions = listOf(
        FilterPills.Option("Tous", null),
        FilterPills.Option("En cours", "pending"),
        FilterPills.Option("Signés", "signed"),
        FilterPills.Option("Clôturés", "closed"),
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
            startActivity(Intent(requireContext(), NewContractActivity::class.java))
        }
        binding.emptyIcon.setImageResource(R.drawable.ic_contract)
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
                val res = SupabaseClient.rest.getContracts()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                if (AuthSession.isAuthError(res.code())) {
                    AuthSession.returnToLogin(requireContext())
                } else if (res.isSuccessful) {
                    allContracts = res.body() ?: emptyList()
                    binding.filterBar.visibility = if (allContracts.isEmpty()) View.GONE else View.VISIBLE
                    applyFilter()
                } else {
                    android.util.Log.e("ContractsTab", "HTTP ${res.code()}: ${res.errorBody()?.string()}")
                    showError(AuthSession.messageFor(res.code()))
                }
            } catch (e: Exception) {
                android.util.Log.e("ContractsTab", "Exception", e)
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError(e.message ?: "Erreur")
            }
        }
    }

    private fun setupFilters() {
        val counts = mapOf<String?, Int>(
            null to allContracts.size,
            "closed" to allContracts.count { it.closedAt != null },
            "signed" to allContracts.count { it.signedAt != null && it.closedAt == null },
            "pending" to allContracts.count { it.signedAt == null && it.closedAt == null },
        )
        FilterPills.build(requireContext(), binding.filterChips, filterOptions, stateFilter, counts) { value ->
            stateFilter = value
            applyFilter()
        }
    }

    private fun applyFilter() {
        setupFilters()
        val filtered = when (stateFilter) {
            "closed" -> allContracts.filter { it.closedAt != null }
            "signed" -> allContracts.filter { it.signedAt != null && it.closedAt == null }
            "pending" -> allContracts.filter { it.signedAt == null && it.closedAt == null }
            else -> allContracts
        }
        adapter.submitList(filtered)
        if (filtered.isEmpty()) {
            binding.emptyView.visibility = View.VISIBLE
            binding.emptyTitle.text = getString(R.string.contracts_empty_title)
            binding.retryButton.visibility = View.GONE
            binding.emptyText.text =
                if (allContracts.isEmpty()) getString(R.string.empty_contracts) else "Aucun résultat pour ce filtre"
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
