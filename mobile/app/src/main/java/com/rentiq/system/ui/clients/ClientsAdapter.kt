package com.rentiq.system.ui.clients

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.Client
import com.rentiq.system.databinding.ItemClientBinding

class ClientsAdapter(
    private val onClick: (Client) -> Unit,
) : RecyclerView.Adapter<ClientsAdapter.VH>() {
    private val items = mutableListOf<Client>()

    fun submitList(list: List<Client>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemClientBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(items[position])

    inner class VH(private val b: ItemClientBinding) : RecyclerView.ViewHolder(b.root) {
        fun bind(c: Client) {
            val ctx = b.root.context
            val name = c.fullName ?: "Client"
            b.avatar.text = name.take(1).uppercase()
            b.name.text = name
            b.meta.text = listOfNotNull(c.cin, c.phone).joinToString(" · ").ifBlank { c.email ?: "" }
            b.status.text = c.status ?: "active"
            val color = when (c.status) {
                "blacklisted" -> R.color.red
                "flagged" -> R.color.amber
                else -> R.color.navy
            }
            b.status.setTextColor(ContextCompat.getColor(ctx, color))
            b.root.setOnClickListener { onClick(c) }
        }
    }
}
