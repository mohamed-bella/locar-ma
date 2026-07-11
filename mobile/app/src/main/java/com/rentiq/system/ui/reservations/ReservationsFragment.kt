package com.rentiq.system.ui.reservations

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.PopupMenu
import android.widget.Toast
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.R
import com.rentiq.system.data.repository.OperationResult
import com.rentiq.system.data.repository.OperationsRepository
import com.rentiq.system.databinding.FragmentListBinding
import com.rentiq.system.ui.common.ContractState
import com.rentiq.system.ui.common.ReservationCardItem
import com.rentiq.system.ui.common.ReservationLifecycle
import com.rentiq.system.ui.contracts.ContractDetailActivity
import com.rentiq.system.ui.contracts.NewContractActivity
import com.rentiq.system.util.AuthSession
import com.rentiq.system.util.FilterPills
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import java.time.LocalDate

class ReservationsFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val repository = OperationsRepository()
    private val adapter = ReservationsAdapter(
        onOpen = { openReservation(it) },
        onMenu = { item, anchor -> showActions(item, anchor) },
    )

    private var allItems: List<ReservationCardItem> = emptyList()
    private var selectedFilter = FILTER_ACTION
    private var query = ""
    private var loading = false
    private var lastLoadedAt = 0L

    private val filterOptions = listOf(
        FilterPills.Option("À traiter", FILTER_ACTION),
        FilterPills.Option("Aujourd’hui", FILTER_TODAY),
        FilterPills.Option("À venir", FILTER_UPCOMING),
        FilterPills.Option("Sans contrat", FILTER_NO_CONTRACT),
        FilterPills.Option("Terminées", FILTER_CLOSED),
        FilterPills.Option("Toutes", FILTER_ALL),
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
        binding.listTitle.setText(R.string.planning_title)
        binding.listSubtitle.setText(R.string.planning_subtitle)
        binding.searchContainer.visibility = View.VISIBLE
        binding.searchInput.setHint(R.string.search_planning_hint)
        binding.resultSummary.visibility = View.VISIBLE
        binding.emptyIcon.setImageResource(R.drawable.ic_calendar)
        binding.addButton.visibility = View.VISIBLE

        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter
        binding.swipeRefresh.setColorSchemeResources(R.color.navy)
        binding.swipeRefresh.setOnRefreshListener { load() }
        binding.retryButton.setOnClickListener { load() }
        binding.addButton.setOnClickListener {
            startActivity(Intent(requireContext(), NewReservationActivity::class.java))
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
                repository.loadPlanning()
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
                    val contractsByReservation = linkedMapOf<String, com.rentiq.system.data.model.Contract>()
                    result.value.contracts.forEach { contract ->
                        contract.reservationId?.let { contractsByReservation.putIfAbsent(it, contract) }
                    }
                    allItems = result.value.reservations
                        .map { ReservationCardItem(it, contractsByReservation[it.id]) }
                        .sortedBy { it.priority() }
                    binding.filterBar.visibility = View.VISIBLE
                    applyFilters()
                }
                is OperationResult.Failure -> {
                    if (result.code == 401 || result.code == 403) {
                        AuthSession.returnToLogin(requireContext())
                    } else {
                        showError(result.message)
                    }
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
            selectedFilter = value ?: FILTER_ACTION
            applyFilters()
        }
    }

    private fun applyFilters() {
        if (_binding == null) return
        buildFilters()
        val filtered = allItems
            .asSequence()
            .filter { matchesFilter(it, selectedFilter) }
            .filter { it.matches(query) }
            .toList()
        adapter.submitList(filtered)

        val missing = allItems.count {
            it.contractState() == ContractState.MISSING && it.lifecycle() !in setOf(
                ReservationLifecycle.CLOSED,
                ReservationLifecycle.CANCELLED,
            )
        }
        binding.resultSummary.text = "${filtered.size} dossier${if (filtered.size > 1) "s" else ""} · $missing contrat${if (missing > 1) "s" else ""} à créer"

        binding.emptyView.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
        if (filtered.isEmpty()) {
            binding.emptyTitle.setText(R.string.reservations_empty_title)
            binding.emptyText.text = when {
                allItems.isEmpty() -> getString(R.string.empty_reservations)
                query.isNotBlank() -> "Aucun dossier ne correspond à votre recherche."
                selectedFilter == FILTER_ACTION -> "Aucune action urgente. Le reste est disponible dans Toutes."
                else -> "Aucun dossier dans ce filtre."
            }
            binding.retryButton.visibility = View.GONE
        }
    }

    private fun matchesFilter(item: ReservationCardItem, filter: String): Boolean {
        val lifecycle = item.lifecycle()
        val today = LocalDate.now()
        return when (filter) {
            FILTER_ACTION -> lifecycle in setOf(
                ReservationLifecycle.OVERDUE,
                ReservationLifecycle.RETURN_TODAY,
                ReservationLifecycle.PICKUP_TODAY,
                ReservationLifecycle.ACTIVE,
            ) || (
                lifecycle == ReservationLifecycle.UPCOMING &&
                    item.start?.let { !it.isAfter(today.plusDays(7)) } == true
                ) || (
                item.contractState() == ContractState.MISSING &&
                    item.start?.let { !it.isAfter(today.plusDays(30)) } == true
                )
            FILTER_TODAY -> lifecycle in setOf(
                ReservationLifecycle.RETURN_TODAY,
                ReservationLifecycle.PICKUP_TODAY,
                ReservationLifecycle.ACTIVE,
                ReservationLifecycle.OVERDUE,
            )
            FILTER_UPCOMING -> lifecycle == ReservationLifecycle.UPCOMING
            FILTER_NO_CONTRACT -> item.contractState() == ContractState.MISSING &&
                lifecycle !in setOf(ReservationLifecycle.CLOSED, ReservationLifecycle.CANCELLED)
            FILTER_CLOSED -> lifecycle == ReservationLifecycle.CLOSED
            else -> lifecycle != ReservationLifecycle.CANCELLED
        }
    }

    private fun openReservation(item: ReservationCardItem) {
        startActivity(
            Intent(requireContext(), ReservationDetailActivity::class.java)
                .putExtra("reservation_id", item.id),
        )
    }

    private fun showActions(item: ReservationCardItem, anchor: View) {
        val popup = PopupMenu(requireContext(), anchor)
        popup.menu.add(0, ACTION_OPEN, 0, "Ouvrir le dossier")
        if (item.contract != null) {
            popup.menu.add(0, ACTION_CONTRACT, 1, "Ouvrir le contrat")
        } else if (item.lifecycle() !in setOf(ReservationLifecycle.CLOSED, ReservationLifecycle.CANCELLED)) {
            popup.menu.add(0, ACTION_CONTRACT, 1, "Créer le contrat")
        }
        if (!item.reservation.clients?.phone.isNullOrBlank()) {
            popup.menu.add(0, ACTION_CONTACT, 2, "Contacter le client")
        }
        if (item.lifecycle() !in setOf(ReservationLifecycle.CLOSED, ReservationLifecycle.CANCELLED)) {
            popup.menu.add(0, ACTION_CANCEL, 3, getString(R.string.archive_reservation))
        }
        popup.setOnMenuItemClickListener { menuItem ->
            when (menuItem.itemId) {
                ACTION_OPEN -> openReservation(item)
                ACTION_CONTRACT -> openContract(item)
                ACTION_CONTACT -> contactClient(item)
                ACTION_CANCEL -> confirmCancel(item)
            }
            true
        }
        popup.show()
    }

    private fun openContract(item: ReservationCardItem) {
        val intent = if (item.contract != null) {
            Intent(requireContext(), ContractDetailActivity::class.java)
                .putExtra("contract_id", item.contract.id)
        } else {
            Intent(requireContext(), NewContractActivity::class.java)
                .putExtra("reservation_id", item.id)
        }
        startActivity(intent)
    }

    private fun contactClient(item: ReservationCardItem) {
        val phone = item.reservation.clients?.phone?.replace(Regex("\\D"), "").orEmpty()
        if (phone.isNotBlank()) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone")))
    }

    private fun confirmCancel(item: ReservationCardItem) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.archive_reservation)
            .setMessage(R.string.confirm_cancel_reservation)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.archive_reservation) { _, _ -> cancelReservation(item) }
            .show()
    }

    private fun cancelReservation(item: ReservationCardItem) {
        binding.progressBar.visibility = View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            val result = try {
                repository.cancelReservation(item.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                OperationResult.Failure(null, e.message ?: "Connexion impossible")
            }
            binding.progressBar.visibility = View.GONE
            when (result) {
                is OperationResult.Success -> {
                    allItems = allItems.filterNot { it.id == item.id }
                    applyFilters()
                    Toast.makeText(requireContext(), R.string.reservation_cancelled, Toast.LENGTH_SHORT).show()
                }
                is OperationResult.Failure -> {
                    if (result.code == 401 || result.code == 403) AuthSession.returnToLogin(requireContext())
                    else Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
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
        private const val FILTER_ACTION = "action"
        private const val FILTER_TODAY = "today"
        private const val FILTER_UPCOMING = "upcoming"
        private const val FILTER_NO_CONTRACT = "no_contract"
        private const val FILTER_CLOSED = "closed"
        private const val FILTER_ALL = "all"
        private const val ACTION_OPEN = 1
        private const val ACTION_CONTRACT = 2
        private const val ACTION_CONTACT = 3
        private const val ACTION_CANCEL = 4
    }
}
