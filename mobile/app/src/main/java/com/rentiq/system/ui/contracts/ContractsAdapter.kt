package com.rentiq.system.ui.contracts

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.Contract
import com.rentiq.system.databinding.ItemContractBinding

class ContractsAdapter(
    private val onClick: (Contract) -> Unit
) : ListAdapter<Contract, ContractsAdapter.VH>(DIFF) {

    class VH(val b: ItemContractBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemContractBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val c = getItem(position)
        val ctx = holder.itemView.context
        holder.b.shortId.text = c.shortId ?: c.id.take(8)
        holder.b.clientName.text = c.reservations?.clients?.fullName ?: "—"
        holder.b.vehicleInfo.text = listOfNotNull(
            c.reservations?.vehicles?.plate,
            c.reservations?.vehicles?.brand,
            c.reservations?.vehicles?.model,
        ).joinToString(" ")
        holder.b.dates.text = listOfNotNull(
            c.reservations?.dateStart, c.reservations?.dateEnd
        ).joinToString(" → ")
        holder.b.amount.text = c.reservations?.totalAmount?.let { "${it.toInt()} DH" } ?: ""

        val signed = c.signedAt != null
        val closed = c.closedAt != null
        val (label, color) = when {
            closed -> "Clôturé" to R.color.muted
            signed -> "Signé" to R.color.green
            else -> "En cours" to R.color.navy
        }
        holder.b.status.text = label
        holder.b.status.setTextColor(ContextCompat.getColor(ctx, color))

        holder.itemView.setOnClickListener { onClick(c) }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Contract>() {
            override fun areItemsTheSame(a: Contract, b: Contract) = a.id == b.id
            override fun areContentsTheSame(a: Contract, b: Contract) = a == b
        }
    }
}
