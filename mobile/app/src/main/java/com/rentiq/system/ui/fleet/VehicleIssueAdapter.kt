package com.rentiq.system.ui.fleet

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ItemVehicleIssueBinding
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class VehicleIssueAdapter(
    private val onResolve: (VehicleIssue) -> Unit,
) : ListAdapter<VehicleIssue, VehicleIssueAdapter.VH>(DIFF) {
    class VH(val b: ItemVehicleIssueBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemVehicleIssueBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val issue = getItem(position)
        val ctx = holder.itemView.context
        holder.b.title.text = issue.title ?: "Probleme"
        holder.b.status.text = issue.status ?: "open"
        holder.b.status.setTextColor(
            ContextCompat.getColor(
                ctx,
                when (issue.status) {
                    "resolved" -> R.color.green
                    "in_progress" -> R.color.amber
                    else -> R.color.red
                },
            ),
        )
        holder.b.meta.text = listOfNotNull(
            label(issue.kind),
            label(issue.category),
            label(issue.severity),
            issue.openedAt?.let { formatDate(it) },
        ).joinToString(" - ")
        holder.b.details.text = buildList {
            if (issue.blocksRental == true) add("Bloque la location")
            issue.garage?.takeIf { it.isNotBlank() }?.let { add("Garage: $it") }
            issue.cost?.let { add("${it.toInt()} DH") }
            issue.description?.takeIf { it.isNotBlank() }?.let { add(it) }
        }.joinToString(" - ")
        holder.b.resolveButton.visibility = if (issue.status == "resolved") View.GONE else View.VISIBLE
        holder.b.resolveButton.setOnClickListener { onResolve(issue) }
    }

    private fun label(value: String?): String? = value?.replace('_', ' ')?.takeIf { it.isNotBlank() }

    private fun formatDate(value: String): String =
        try {
            LocalDate.parse(value.take(10)).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        } catch (_: Exception) {
            value
        }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<VehicleIssue>() {
            override fun areItemsTheSame(a: VehicleIssue, b: VehicleIssue) = a.id == b.id
            override fun areContentsTheSame(a: VehicleIssue, b: VehicleIssue) = a == b
        }
    }
}
