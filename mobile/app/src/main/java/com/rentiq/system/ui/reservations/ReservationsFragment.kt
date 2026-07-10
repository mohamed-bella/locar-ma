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
import com.rentiq.system.util.Notify
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class ReservationsFragment : Fragment() {
    private var _binding: FragmentListBinding? = null
    private val binding get() = _binding!!
    private val adapter = ReservationsAdapter { reservation -> confirmCancel(reservation) }

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
                val res = SupabaseClient.rest.getReservations()
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                if (res.isSuccessful) {
                    val list = res.body() ?: emptyList()
                    adapter.submitList(list)
                    if (list.isEmpty()) {
                        binding.emptyView.visibility = View.VISIBLE
                        binding.emptyText.text = getString(R.string.empty_reservations)
                    }
                } else {
                    showError("Erreur ${res.code()}")
                }
            } catch (e: Exception) {
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                showError(e.message ?: "Erreur de chargement")
            }
        }
    }

    private fun showError(msg: String) {
        binding.emptyView.visibility = View.VISIBLE
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
        val agencyId = SessionManager(requireContext()).agencyId
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.updateReservationStatus(
                    "eq.${reservation.id}",
                    mapOf("status" to "cancelled")
                )
                binding.progressBar.visibility = View.GONE
                if (res.isSuccessful) {
                    Toast.makeText(requireContext(), R.string.reservation_cancelled, Toast.LENGTH_SHORT).show()
                    Notify.enqueue(
                        agencyId,
                        "reservation_cancelled",
                        mapOf(
                            "reservation_id" to reservation.id,
                            "vehicle" to reservation.vehicles?.displayName,
                            "plate" to reservation.vehicles?.plate,
                            "client" to reservation.clients?.fullName,
                            "client_phone" to reservation.clients?.phone,
                            "date_start" to reservation.dateStart,
                            "date_end" to reservation.dateEnd,
                        ),
                    )
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
