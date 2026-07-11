package com.rentiq.system.ui.fleet

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.databinding.ItemVehicleBinding
import com.rentiq.system.ui.common.VehicleCardItem

class FleetAdapter(
    private val onClick: (VehicleCardItem) -> Unit,
) : ListAdapter<VehicleCardItem, FleetAdapter.VH>(DIFF) {

    class VH(val binding: ItemVehicleBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemVehicleBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val vehicle = item.vehicle
        val context = holder.itemView.context

        holder.binding.name.text = vehicle.displayName
        holder.binding.plate.text = vehicle.plate ?: "—"
        holder.binding.meta.text = listOfNotNull(
            vehicle.year?.toString(),
            vehicle.category?.replaceFirstChar { it.uppercase() },
            vehicle.mileage?.let { "${it} km" },
        ).joinToString(" · ")
        holder.binding.rate.text = vehicle.dailyRate?.let { "${it.toInt()} DH / jour" } ?: "Tarif à renseigner"

        val imageKey = vehicle.imageKeys?.firstOrNull()
        if (imageKey != null) {
            holder.binding.vehicleImage.setPadding(0, 0, 0, 0)
            holder.binding.vehicleImage.clearColorFilter()
            holder.binding.vehicleImage.setBackgroundColor(ContextCompat.getColor(context, R.color.surface_soft))
            holder.binding.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL.trimEnd('/')}/$imageKey") {
                crossfade(true)
                placeholder(R.drawable.image_placeholder)
                error(R.drawable.image_placeholder)
            }
        } else {
            val padding = (24 * context.resources.displayMetrics.density).toInt()
            holder.binding.vehicleImage.setPadding(padding, padding, padding, padding)
            holder.binding.vehicleImage.setImageResource(R.drawable.ic_car)
            holder.binding.vehicleImage.setColorFilter(ContextCompat.getColor(context, R.color.navy))
            holder.binding.vehicleImage.setBackgroundColor(ContextCompat.getColor(context, R.color.navy_light))
        }

        val (statusLabel, statusColor) = when (vehicle.status) {
            "available" -> context.getString(R.string.status_available) to R.color.green
            "rented", "active" -> context.getString(R.string.status_rented) to R.color.red
            "maintenance" -> context.getString(R.string.status_maintenance) to R.color.amber
            "reserved" -> context.getString(R.string.status_reserved) to R.color.navy
            else -> (vehicle.status ?: "—") to R.color.muted
        }
        holder.binding.status.text = statusLabel
        holder.binding.status.setTextColor(ContextCompat.getColor(context, statusColor))

        val reasons = item.attentionReasons
        holder.binding.attention.visibility = if (reasons.isEmpty()) View.GONE else View.VISIBLE
        holder.binding.attention.text = when {
            reasons.isEmpty() -> ""
            reasons.size == 1 -> reasons.first()
            else -> "${reasons.first()} · +${reasons.size - 1}"
        }

        holder.binding.root.setOnClickListener { onClick(item) }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<VehicleCardItem>() {
            override fun areItemsTheSame(oldItem: VehicleCardItem, newItem: VehicleCardItem) =
                oldItem.id == newItem.id

            override fun areContentsTheSame(oldItem: VehicleCardItem, newItem: VehicleCardItem) =
                oldItem == newItem
        }
    }
}
