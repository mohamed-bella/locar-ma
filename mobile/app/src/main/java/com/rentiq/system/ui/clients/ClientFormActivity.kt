package com.rentiq.system.ui.clients

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.data.model.ClientInsert
import com.rentiq.system.databinding.ActivityClientFormBinding
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch

class ClientFormActivity : AppCompatActivity() {
    private lateinit var b: ActivityClientFormBinding
    private var clientId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityClientFormBinding.inflate(layoutInflater)
        setContentView(b.root)
        clientId = intent.getStringExtra("client_id")
        b.toolbar.setNavigationOnClickListener { finish() }
        b.saveButton.setOnClickListener { saveWithBlacklistCheck() }
        clientId?.let { load(it) }
    }

    private fun load(id: String) {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getClient("eq.$id")
                if (res.isSuccessful && res.body() != null) {
                    render(res.body()!!)
                }
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun render(c: Client) {
        b.fullName.setText(c.fullName.orEmpty())
        b.cin.setText(c.cin.orEmpty())
        b.phone.setText(c.phone.orEmpty())
        b.email.setText(c.email.orEmpty())
        b.nationality.setText(c.nationality.orEmpty())
        b.address.setText(c.address.orEmpty())
    }

    private fun saveWithBlacklistCheck() {
        if (clientId != null) {
            save()
            return
        }
        val cin = b.cin.text.toString().trim()
        if (cin.isBlank()) {
            save()
            return
        }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getClients(
                    select = "id,full_name,phone,cin_passport,email,nationality,address,status,blacklist_reason,blacklist_date",
                    order = "full_name.asc"
                )
                val risky = (res.body() ?: emptyList()).filter {
                    it.cin == cin && it.status in setOf("flagged", "blacklisted")
                }
                b.progress.visibility = View.GONE
                if (risky.isNotEmpty()) {
                    MaterialAlertDialogBuilder(this@ClientFormActivity)
                        .setTitle("Client signalé")
                        .setMessage("Un client avec ce CIN est déjà signalé. Continuer quand même ?")
                        .setNegativeButton("Annuler", null)
                        .setPositiveButton("Continuer") { _, _ -> save() }
                        .show()
                } else {
                    save()
                }
            } catch (_: Exception) {
                b.progress.visibility = View.GONE
                save()
            }
        }
    }

    private fun save() {
        val name = b.fullName.text.toString().trim()
        if (name.isBlank()) {
            Toast.makeText(this, "Nom obligatoire", Toast.LENGTH_SHORT).show()
            return
        }
        val agencyId = SessionManager(this).agencyId
        if (clientId == null && agencyId.isNullOrBlank()) {
            Toast.makeText(this, "Agence non trouvée", Toast.LENGTH_SHORT).show()
            return
        }
        b.progress.visibility = View.VISIBLE
        b.saveButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val id = clientId
                val res = if (id == null) {
                    SupabaseClient.rest.createClient(
                        ClientInsert(
                            agencyId = agencyId!!,
                            fullName = name,
                            phone = nullable(b.phone.text.toString()),
                            cin = nullable(b.cin.text.toString()),
                            email = nullable(b.email.text.toString()),
                            nationality = nullable(b.nationality.text.toString()),
                            address = nullable(b.address.text.toString()),
                        )
                    )
                } else {
                    SupabaseClient.rest.updateClient(
                        "eq.$id",
                        mapOf(
                            "full_name" to name,
                            "phone" to nullable(b.phone.text.toString()),
                            "cin_passport" to nullable(b.cin.text.toString()),
                            "email" to nullable(b.email.text.toString()),
                            "nationality" to nullable(b.nationality.text.toString()),
                            "address" to nullable(b.address.text.toString()),
                        )
                    )
                }
                if (res.isSuccessful) {
                    Toast.makeText(this@ClientFormActivity, "Client enregistré", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    Toast.makeText(this@ClientFormActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ClientFormActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
                b.saveButton.isEnabled = true
            }
        }
    }

    private fun nullable(value: String): String? = value.trim().ifBlank { null }
}
