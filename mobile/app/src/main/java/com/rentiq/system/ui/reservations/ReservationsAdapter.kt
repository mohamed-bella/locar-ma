package com.rentiq.system.ui.reservations

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import android.content.res.ColorStateList
import com.rentiq.system.R
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ItemReservationBinding
import java.time.LocalDate
import java.time.temporal.ChronoUnit

class ReservationsAdapter(
    private val onCancel: (Reservation) -> Unit,
    private val onClick: (Reservation) -> Unit = {},
) : ListAdapter<Reservation, ReservationsAdapter.VH>(DIFF) {
    class VH(val b: ItemReservationBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemReservationBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = getItem(position)
        val ctx = holder.itemView.context
        holder.b.clientName.text = r.clients?.fullName ?: "Client"
        holder.b.vehicleInfo.text = listOfNotNull(
            r.vehicles?.brand, r.vehicles?.model, r.vehicles?.plate?.let { "($it)" }
        ).joinToString(" ")
        holder.b.dates.text = "${r.dateStart ?: "?"} → ${r.dateEnd ?: "?"}"
        holder.b.amount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: "—"
        holder.b.perDay.text = r.dailyRate?.let { "${it.toInt()} DH/jour" } ?: ""
        holder.b.perDay.visibility = if (r.dailyRate != null) View.VISIBLE else View.GONE
        holder.itemView.setOnClickListener { onClick(r) }

        val (label, color) = when (r.status) {
            "confirmed" -> "Confirmée" to R.color.green
            "active" -> "Active" to R.color.navy
            "pending" -> "En attente" to R.color.amber
            "closed" -> "Terminée" to R.color.muted
            "cancelled" -> "Annulée" to R.color.red
            else -> (r.status ?: "—") to R.color.muted
        }
        holder.b.status.text = label
        holder.b.status.setTextColor(ContextCompat.getColor(ctx, color))
        holder.b.cancelButton.visibility = if (r.status == "cancelled" || r.status == "closed") View.GONE else View.VISIBLE
        holder.b.cancelButton.setOnClickListener { onCancel(r) }

        // ── Lifecycle state + remaining days ─────────────────────────────────
        val today = LocalDate.now()
        val start = r.dateStart?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val end = r.dateEnd?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

        val (badgeText, stateColorRes) = when {
            r.status == "cancelled" -> "Annulée" to R.color.red
            r.status == "closed" || (end != null && today.isAfter(end)) -> "Terminée" to R.color.muted
            start != null && today.isBefore(start) -> {
                val d = ChronoUnit.DAYS.between(today, start)
                "À venir · commence dans ${d}j" to R.color.blue_action
            }
            start != null && end != null && !today.isBefore(start) && !today.isAfter(end) -> {
                val left = ChronoUnit.DAYS.between(today, end)
                if (left <= 0) "En location · dernier jour" to R.color.green
                else "En location · ${left}j restant${if (left > 1) "s" else ""}" to R.color.green
            }
            else -> (label) to color
        }
        val stateColor = ContextCompat.getColor(ctx, stateColorRes)
        holder.b.stateBadge.text = badgeText
        holder.b.stateBadge.backgroundTintList = ColorStateList.valueOf(stateColor)
        holder.b.accentStrip.setBackgroundColor(stateColor)
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Reservation>() {
            override fun areItemsTheSame(a: Reservation, b: Reservation) = a.id == b.id
            override fun areContentsTheSame(a: Reservation, b: Reservation) = a == b
        }
    }
}
