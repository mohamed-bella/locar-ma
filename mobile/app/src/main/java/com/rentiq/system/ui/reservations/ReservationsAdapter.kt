package com.rentiq.system.ui.reservations

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.databinding.ItemReservationBinding
import com.rentiq.system.ui.common.ContractState
import com.rentiq.system.ui.common.ReservationCardItem
import com.rentiq.system.ui.common.ReservationLifecycle
import com.rentiq.system.ui.common.shortDate
import java.time.LocalDate
import java.time.temporal.ChronoUnit

class ReservationsAdapter(
    private val onOpen: (ReservationCardItem) -> Unit,
    private val onMenu: (ReservationCardItem, View) -> Unit,
) : ListAdapter<ReservationCardItem, ReservationsAdapter.VH>(DIFF) {

    class VH(val binding: ItemReservationBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemReservationBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val reservation = item.reservation
        val context = holder.itemView.context
        val lifecycle = item.lifecycle()

        holder.binding.clientName.text = reservation.clients?.fullName ?: "Client non renseigné"
        holder.binding.vehicleInfo.text = listOfNotNull(
            reservation.vehicles?.brand,
            reservation.vehicles?.model,
            reservation.vehicles?.plate?.let { "· $it" },
        ).joinToString(" ").ifBlank { "Voiture non renseignée" }

        val start = item.start
        val end = item.end
        holder.binding.dates.text = when {
            start != null && end != null -> "${start.shortDate()}  →  ${end.shortDate()}"
            else -> "Dates à vérifier"
        }
        holder.binding.amount.text = reservation.totalAmount?.let { "${it.toInt()} DH" } ?: "—"
        holder.binding.perDay.text = reservation.dailyRate?.let { "${it.toInt()} DH / jour" } ?: ""

        val badge = lifecycleBadge(lifecycle, start, end)
        holder.binding.stateBadge.text = badge.label
        holder.binding.stateBadge.setTextColor(ContextCompat.getColor(context, badge.foreground))
        holder.binding.stateBadge.backgroundTintList = ColorStateList.valueOf(
            ContextCompat.getColor(context, badge.background),
        )
        holder.binding.status.text = statusLabel(lifecycle)

        val contract = contractLabel(item.contractState())
        holder.binding.contractState.text = contract.first
        holder.binding.contractState.setTextColor(ContextCompat.getColor(context, contract.second))

        holder.binding.root.setOnClickListener { onOpen(item) }
        holder.binding.menuButton.setOnClickListener { onMenu(item, holder.binding.menuButton) }
    }

    private fun lifecycleBadge(
        lifecycle: ReservationLifecycle,
        start: LocalDate?,
        end: LocalDate?,
    ): Badge {
        val today = LocalDate.now()
        return when (lifecycle) {
            ReservationLifecycle.OVERDUE -> {
                val days = end?.let { ChronoUnit.DAYS.between(it, today).coerceAtLeast(1) } ?: 1
                Badge("Retour en retard · ${days}j", R.color.red, R.color.danger_soft)
            }
            ReservationLifecycle.RETURN_TODAY -> Badge("Retour aujourd’hui", R.color.amber, R.color.warning_soft)
            ReservationLifecycle.PICKUP_TODAY -> Badge("Départ aujourd’hui", R.color.navy, R.color.blue_soft)
            ReservationLifecycle.ACTIVE -> {
                val days = end?.let { ChronoUnit.DAYS.between(today, it).coerceAtLeast(0) }
                Badge(if (days == null) "En location" else "En location · ${days}j", R.color.green, R.color.success_soft)
            }
            ReservationLifecycle.UPCOMING -> {
                val days = start?.let { ChronoUnit.DAYS.between(today, it).coerceAtLeast(1) }
                Badge(if (days == null) "À venir" else "Départ dans ${days}j", R.color.navy, R.color.blue_soft)
            }
            ReservationLifecycle.CONFIRMED -> Badge("Confirmée", R.color.navy, R.color.blue_soft)
            ReservationLifecycle.CLOSED -> Badge("Terminée", R.color.muted, R.color.surface_soft)
            ReservationLifecycle.CANCELLED -> Badge("Archivée", R.color.red, R.color.danger_soft)
        }
    }

    private fun contractLabel(state: ContractState): Pair<String, Int> = when (state) {
        ContractState.MISSING -> "Contrat à créer" to R.color.amber
        ContractState.TO_SIGN -> "Contrat à signer" to R.color.amber
        ContractState.SENT -> "Signature envoyée" to R.color.navy
        ContractState.SIGNED -> "Contrat signé" to R.color.green
        ContractState.CLOSED -> "Contrat clôturé" to R.color.muted
    }

    private fun statusLabel(lifecycle: ReservationLifecycle): String = when (lifecycle) {
        ReservationLifecycle.OVERDUE -> "À RÉGLER"
        ReservationLifecycle.RETURN_TODAY -> "RETOUR"
        ReservationLifecycle.PICKUP_TODAY -> "DÉPART"
        ReservationLifecycle.ACTIVE -> "EN COURS"
        ReservationLifecycle.UPCOMING, ReservationLifecycle.CONFIRMED -> "CONFIRMÉE"
        ReservationLifecycle.CLOSED -> "TERMINÉE"
        ReservationLifecycle.CANCELLED -> "ARCHIVÉE"
    }

    private data class Badge(val label: String, val foreground: Int, val background: Int)

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<ReservationCardItem>() {
            override fun areItemsTheSame(oldItem: ReservationCardItem, newItem: ReservationCardItem) =
                oldItem.id == newItem.id

            override fun areContentsTheSame(oldItem: ReservationCardItem, newItem: ReservationCardItem) =
                oldItem == newItem
        }
    }
}
