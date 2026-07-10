package com.rentiq.system.ui.fleet

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.model.Vehicle
import com.rentiq.system.databinding.ItemVehicleBinding

class FleetAdapter(
    private val onClick: (Vehicle) -> Unit
) : ListAdapter<Vehicle, FleetAdapter.VH>(DIFF) {

    class VH(val b: ItemVehicleBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemVehicleBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val v = getItem(position)
        val ctx = holder.itemView.context
        holder.b.plate.text = v.plate ?: "—"
        holder.b.name.text = v.displayName
        holder.b.meta.text = listOfNotNull(
            v.year?.toString(),
            v.category,
            v.mileage?.let { "${it} km" },
        ).joinToString(" · ")

        val firstKey = v.imageKeys?.firstOrNull()
        if (firstKey != null) {
            holder.b.vehicleImage.load("${BuildConfig.R2_PUBLIC_URL}/$firstKey") {
                crossfade(true)
                error(R.color.navy_light)
            }
        } else {
            holder.b.vehicleImage.setImageResource(0)
            holder.b.vehicleImage.setBackgroundColor(ContextCompat.getColor(ctx, R.color.navy_light))
        }

        val (label, color) = when (v.status) {
            "available" -> ctx.getString(R.string.status_available) to R.color.green
            "rented" -> ctx.getString(R.string.status_rented) to R.color.red
            "maintenance" -> ctx.getString(R.string.status_maintenance) to R.color.amber
            "reserved" -> ctx.getString(R.string.status_reserved) to R.color.navy
            else -> (v.status ?: "—") to R.color.muted
        }
        holder.b.status.text = label
        holder.b.status.setTextColor(ContextCompat.getColor(ctx, color))

        holder.b.rate.text = v.dailyRate?.let { "${it.toInt()} DH" } ?: ""

        holder.itemView.setOnClickListener { onClick(v) }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Vehicle>() {
            override fun areItemsTheSame(a: Vehicle, b: Vehicle) = a.id == b.id
            override fun areContentsTheSame(a: Vehicle, b: Vehicle) = a == b
        }
    }
}
