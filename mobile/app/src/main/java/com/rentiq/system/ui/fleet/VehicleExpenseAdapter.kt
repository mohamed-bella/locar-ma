package com.rentiq.system.ui.fleet

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.rentiq.system.data.model.VehicleExpense
import com.rentiq.system.databinding.ItemVehicleExpenseBinding
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class VehicleExpenseAdapter(
    private val onDelete: (VehicleExpense) -> Unit,
) : ListAdapter<VehicleExpense, VehicleExpenseAdapter.VH>(DIFF) {
    class VH(val b: ItemVehicleExpenseBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemVehicleExpenseBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val expense = getItem(position)
        holder.b.name.text = expense.name ?: "Depense"
        holder.b.meta.text = formatDate(expense.spentAt)
        holder.b.amount.text = "${(expense.amount ?: 0.0).toInt()} DH"
        holder.b.deleteButton.setOnClickListener { onDelete(expense) }
    }

    private fun formatDate(value: String?): String {
        if (value.isNullOrBlank()) return "-"
        return try {
            LocalDate.parse(value.take(10)).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        } catch (_: Exception) {
            value
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<VehicleExpense>() {
            override fun areItemsTheSame(a: VehicleExpense, b: VehicleExpense) = a.id == b.id
            override fun areContentsTheSame(a: VehicleExpense, b: VehicleExpense) = a == b
        }
    }
}
