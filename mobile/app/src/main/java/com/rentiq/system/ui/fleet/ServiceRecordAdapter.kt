package com.rentiq.system.ui.fleet

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.ServiceRecord
import com.rentiq.system.databinding.ItemServiceRecordBinding
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class ServiceRecordAdapter : ListAdapter<ServiceRecord, ServiceRecordAdapter.VH>(DIFF) {
    class VH(val b: ItemServiceRecordBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemServiceRecordBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val r = getItem(position)
        val ctx = holder.itemView.context
        holder.b.type.text = typeLabel(r.type)
        holder.b.vehicle.text = r.vehicles?.displayName ?: "—"
        holder.b.meta.text = buildList {
            add(r.performedAt?.let { formatDate(it) } ?: "—")
            r.odometerKm?.let { add("$it km") }
            r.garage?.let { add(it) }
        }.joinToString(" · ")
        holder.b.details.text = buildList {
            r.cost?.let { add("${it.toInt()} DH") }
            r.nextDueKm?.let { add("Prochain: $it km") }
            r.nextDueDate?.let { add("Prochain: ${formatDate(it)}") }
            r.notes?.takeIf { it.isNotBlank() }?.let { add(it) }
        }.joinToString(" · ")

        val color = when (r.type) {
            "vidange" -> R.color.green
            "freins" -> R.color.red
            "pneus" -> R.color.amber
            "courroie" -> R.color.navy
            "filtre" -> R.color.muted
            else -> R.color.ink
        }
        holder.b.type.setTextColor(ContextCompat.getColor(ctx, color))
    }

    private fun typeLabel(type: String?): String = when (type) {
        "vidange" -> "Vidange"
        "freins" -> "Freins"
        "pneus" -> "Pneus"
        "courroie" -> "Courroie"
        "filtre" -> "Filtre"
        "autre" -> "Autre"
        else -> type ?: "—"
    }

    private fun formatDate(value: String): String {
        return try {
            LocalDate.parse(value.take(10)).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        } catch (_: Exception) {
            value
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<ServiceRecord>() {
            override fun areItemsTheSame(a: ServiceRecord, b: ServiceRecord) = a.id == b.id
            override fun areContentsTheSame(a: ServiceRecord, b: ServiceRecord) = a == b
        }
    }
}
