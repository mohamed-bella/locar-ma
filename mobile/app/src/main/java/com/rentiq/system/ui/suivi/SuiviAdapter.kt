package com.rentiq.system.ui.suivi

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.R
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ItemSuiviBinding
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.format.DateTimeFormatter

class SuiviAdapter(
    private val onOpen: (Vehicle) -> Unit,
    private val onAddService: (Vehicle) -> Unit,
) : ListAdapter<Vehicle, SuiviAdapter.VH>(DIFF) {
    class VH(val b: ItemSuiviBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemSuiviBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val v = getItem(position)
        val ctx = holder.itemView.context
        holder.b.name.text = v.displayName
        holder.b.plate.text = v.plate ?: "—"
        holder.b.summary.text = followUpSummary(v)
        holder.b.status.text = v.status?.replaceFirstChar { it.uppercase() } ?: "—"
        holder.b.status.setTextColor(ContextCompat.getColor(ctx, statusColor(v.status)))
        holder.b.openButton.setOnClickListener { onAddService(v) }
        holder.itemView.setOnClickListener { onOpen(v) }
    }

    private fun statusColor(status: String?): Int = when (status) {
        "available" -> R.color.green
        "rented" -> R.color.red
        "maintenance" -> R.color.amber
        "reserved" -> R.color.navy
        else -> R.color.muted
    }

    private fun followUpSummary(v: Vehicle): String {
        val parts = mutableListOf<String>()
        v.insuranceExpiry?.let { parts.add("Assurance ${expiryLabel(it)}") }
        v.vignetteExpiry?.let { parts.add("Vignette ${expiryLabel(it)}") }
        v.visiteTechExpiry?.let { parts.add("CT ${expiryLabel(it)}") }
        v.oilChangeLastKm?.let { lastKm ->
            val interval = v.oilChangeIntervalKm ?: 10000
            val left = interval - ((v.mileage ?: 0) - lastKm)
            parts.add(if (left <= 0) "Vidange dépassée" else "Vidange dans ${left} km")
        }
        v.nextServiceNote?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        if (parts.isEmpty()) parts.add("Aucun suivi renseigné")
        return parts.joinToString(" · ")
    }

    private fun expiryLabel(dateStr: String): String {
        return try {
            val date = LocalDate.parse(dateStr.take(10))
            val days = ChronoUnit.DAYS.between(LocalDate.now(), date)
            val text = date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
            when {
                days < 0 -> "$text expiré"
                days <= 30 -> "$text dans ${days}j"
                else -> text
            }
        } catch (_: Exception) {
            dateStr
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Vehicle>() {
            override fun areItemsTheSame(a: Vehicle, b: Vehicle) = a.id == b.id
            override fun areContentsTheSame(a: Vehicle, b: Vehicle) = a == b
        }
    }
}
