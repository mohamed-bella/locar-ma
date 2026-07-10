package com.rentiq.system.ui.clients

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.databinding.ActivityClientDetailBinding
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate

class ClientDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityClientDetailBinding
    private val historyAdapter = ClientHistoryAdapter()
    private var client: Client? = null
    private val clientId: String? get() = intent.getStringExtra("client_id")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityClientDetailBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        b.history.layoutManager = LinearLayoutManager(this)
        b.history.adapter = historyAdapter
        b.editButton.setOnClickListener {
            clientId?.let { id -> startActivity(Intent(this, ClientFormActivity::class.java).putExtra("client_id", id)) }
        }
        b.statusButton.setOnClickListener { toggleStatus() }
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val id = clientId ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val clientCall = async { SupabaseClient.rest.getClient("eq.$id") }
                val historyCall = async { SupabaseClient.rest.getClientReservations("eq.$id") }
                val cRes = clientCall.await()
                val hRes = historyCall.await()
                if (cRes.isSuccessful && cRes.body() != null) {
                    client = cRes.body()
                    render(cRes.body()!!)
                }
                if (hRes.isSuccessful) historyAdapter.submitList(hRes.body() ?: emptyList())
            } catch (e: Exception) {
                Toast.makeText(this@ClientDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun render(c: Client) {
        b.name.text = c.fullName ?: "Client"
        b.status.text = c.status ?: "active"
        b.info.text = listOfNotNull(
            c.cin?.let { "CIN: $it" },
            c.phone?.let { "Téléphone: $it" },
            c.email?.let { "Email: $it" },
            c.nationality?.let { "Nationalité: $it" },
            c.address?.let { "Adresse: $it" },
        ).joinToString("\n")
        val flagged = c.status != null && c.status != "active"
        b.statusButton.text = if (flagged) "Réactiver" else "Blacklister"
        b.blacklistInfo.visibility = if (flagged) View.VISIBLE else View.GONE
        b.blacklistInfo.text = listOfNotNull(c.blacklistReason, c.blacklistDate).joinToString(" · ")
    }

    private fun toggleStatus() {
        val c = client ?: return
        val flagged = c.status != null && c.status != "active"
        if (flagged) {
            setStatus("active", null)
            return
        }
        val reasons = arrayOf("Paiement", "Incident véhicule", "Document invalide", "Autre")
        MaterialAlertDialogBuilder(this)
            .setTitle("Raison du blacklist")
            .setItems(reasons) { _, which -> setStatus("blacklisted", reasons[which]) }
            .show()
    }

    private fun setStatus(status: String, reason: String?) {
        val id = clientId ?: return
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val body = mutableMapOf<String, Any?>(
                    "status" to status,
                    "blacklist_reason" to if (status == "active") null else reason,
                    "blacklist_date" to if (status == "active") null else LocalDate.now().toString(),
                )
                val res = SupabaseClient.rest.updateClient("eq.$id", body)
                if (res.isSuccessful) load() else Toast.makeText(this@ClientDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@ClientDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }
}
