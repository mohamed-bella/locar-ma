package com.rentiq.system.ui.clients

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ItemClientHistoryBinding

class ClientHistoryAdapter : RecyclerView.Adapter<ClientHistoryAdapter.VH>() {
    private val items = mutableListOf<Reservation>()

    fun submitList(list: List<Reservation>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemClientHistoryBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(items[position])

    class VH(private val b: ItemClientHistoryBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(r: Reservation) {
            b.vehicle.text = r.vehicles?.displayName ?: r.vehicles?.plate ?: "Véhicule"
            b.dates.text = "${r.dateStart ?: "-"} → ${r.dateEnd ?: "-"} · ${r.status ?: ""}"
            b.amount.text = r.totalAmount?.let { "${it.toInt()} DH" } ?: ""
        }
    }
}
