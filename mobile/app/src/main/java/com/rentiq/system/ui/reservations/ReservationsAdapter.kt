package com.rentiq.system.ui.reservations

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ItemReservationBinding

class ReservationsAdapter(
    private val onCancel: (Reservation) -> Unit,
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
        holder.b.dates.text = "${r.dateStart ?: "?"} â†’ ${r.dateEnd ?: "?"}"
        holder.b.amount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: ""

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
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Reservation>() {
            override fun areItemsTheSame(a: Reservation, b: Reservation) = a.id == b.id
            override fun areContentsTheSame(a: Reservation, b: Reservation) = a == b
        }
    }
}
