package com.rentiq.system.ui.clients

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Client
import com.rentiq.system.databinding.ActivityClientsBinding
import kotlinx.coroutines.launch

class ClientsActivity : AppCompatActivity() {
    private lateinit var b: ActivityClientsBinding
    private val adapter = ClientsAdapter { client ->
        startActivity(Intent(this, ClientDetailActivity::class.java).putExtra("client_id", client.id))
    }
    private var allClients = listOf<Client>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityClientsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        b.recyclerView.layoutManager = LinearLayoutManager(this)
        b.recyclerView.adapter = adapter
        b.addButton.setOnClickListener {
            startActivity(Intent(this, ClientFormActivity::class.java))
        }
        b.search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = filter()
            override fun afterTextChanged(s: Editable?) = Unit
        })
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getClients()
                if (res.isSuccessful) {
                    allClients = res.body() ?: emptyList()
                    filter()
                } else {
                    Toast.makeText(this@ClientsActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ClientsActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun filter() {
        val q = b.search.text.toString().trim().lowercase()
        val filtered = if (q.isBlank()) allClients else allClients.filter {
            listOf(it.fullName, it.cin, it.phone, it.email)
                .filterNotNull()
                .joinToString(" ")
                .lowercase()
                .contains(q)
        }
        val flagged = allClients.count { it.status != null && it.status != "active" }
        b.summary.text = "${allClients.size} clients · $flagged signalés"
        adapter.submitList(filtered)
    }
}
