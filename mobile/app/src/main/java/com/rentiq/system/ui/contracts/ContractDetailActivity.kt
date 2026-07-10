package com.rentiq.system.ui.contracts

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Contract
import com.rentiq.system.databinding.ActivityContractDetailBinding
import com.rentiq.system.util.Notify
import com.rentiq.system.util.QrGen
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.launch
import java.net.URLEncoder

class ContractDetailActivity : AppCompatActivity() {
    private lateinit var b: ActivityContractDetailBinding
    private var contract: Contract? = null
    private val fuelLevels = listOf("empty", "quarter", "half", "three_quarters", "full")
    private val fuelLabels = listOf("Vide", "1/4", "1/2", "3/4", "Plein")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityContractDetailBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.toolbar.setNavigationOnClickListener { finish() }
        b.closeFuelIn.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, fuelLabels)
            .also { it.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }

        b.clearSignature.setOnClickListener { b.signatureView.clear() }
        b.signButton.setOnClickListener { signContract() }
        b.copyLink.setOnClickListener { copySignLink() }
        b.viewPdfButton.setOnClickListener { previewContract() }
        b.closeContractButton.setOnClickListener { confirmCloseContract() }

        loadContract()
    }

    private val signUrl: String? get() = contract?.signToken?.let { "${BuildConfig.WEBAPP_BASE_URL}/sign/$it" }

    private fun loadContract() {
        val contractId = intent.getStringExtra("contract_id") ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getContract("eq.$contractId")
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    contract = res.body()
                    contract?.let { bind(it) }
                } else {
                    Toast.makeText(this@ContractDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@ContractDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun bind(c: Contract) {
        b.shortId.text = "Contrat #${c.shortId ?: c.id.take(8)}"
        b.clientName.text = c.reservations?.clients?.fullName ?: "—"
        b.clientCin.text = c.reservations?.clients?.cin?.let { "CIN: $it" } ?: ""
        b.clientPhone.text = c.reservations?.clients?.phone?.let { "Tél: $it" } ?: ""

        // Form fields
        val f = c.form ?: emptyMap()
        val formParts = mutableListOf<String>()
        f["client_permit_number"]?.let { formParts.add("Permis: $it") }
        f["client_permit_date"]?.let { formParts.add("Date permis: $it") }
        f["client_permit_place"]?.let { formParts.add("Lieu: $it") }
        f["client_phone2"]?.let { formParts.add("Tél 2: $it") }
        f["client_profession"]?.let { formParts.add("Profession: $it") }
        b.clientExtra.text = formParts.joinToString("\n")
        b.clientExtra.visibility = if (formParts.isEmpty()) View.GONE else View.VISIBLE

        // 2nd driver
        val d2Parts = mutableListOf<String>()
        f["d2_nom"]?.let { d2Parts.add(it) }
        f["d2_cin"]?.let { d2Parts.add("CIN: $it") }
        f["d2_permit_number"]?.let { d2Parts.add("Permis: $it") }
        f["d2_phone"]?.let { d2Parts.add("Tél: $it") }
        if (d2Parts.isNotEmpty()) {
            b.driver2Section.visibility = View.VISIBLE
            b.driver2Info.text = d2Parts.joinToString("\n")
        } else {
            b.driver2Section.visibility = View.GONE
        }

        val v = c.reservations?.vehicles
        b.vehicleName.text = listOfNotNull(v?.brand, v?.model).joinToString(" ")
        b.vehiclePlate.text = v?.plate ?: ""

        b.dates.text = listOfNotNull(c.reservations?.dateStart, c.reservations?.dateEnd).joinToString(" → ")
        b.totalAmount.text = c.reservations?.totalAmount?.let { "${it.toInt()} DH" } ?: ""

        // Times
        val times = mutableListOf<String>()
        f["heure_depart"]?.let { times.add("Départ: $it") }
        f["heure_retour"]?.let { times.add("Retour: $it") }
        b.times.text = times.joinToString("  ·  ")
        b.times.visibility = if (times.isEmpty()) View.GONE else View.VISIBLE

        b.mileageOut.text = "Départ: ${c.mileageOut ?: "—"} km"
        b.mileageIn.text = "Retour: ${c.mileageIn ?: "—"} km"
        b.fuelOut.text = "Carb. départ: ${fuelLabel(c.fuelOut)}"
        b.fuelIn.text = "Carb. retour: ${fuelLabel(c.fuelIn)}"
        b.closeMileageIn.setText(c.mileageIn?.toString().orEmpty())
        val fuelInIndex = fuelLevels.indexOf(c.fuelIn)
        val fuelOutIndex = fuelLevels.indexOf(c.fuelOut)
        b.closeFuelIn.setSelection(
            when {
                fuelInIndex >= 0 -> fuelInIndex
                fuelOutIndex >= 0 -> fuelOutIndex
                else -> fuelLevels.lastIndex
            }
        )

        // Check/caution
        if (c.checkNumber != null || c.checkBank != null) {
            b.checkSection.visibility = View.VISIBLE
            val checkParts = mutableListOf<String>()
            c.checkNumber?.let { checkParts.add("N° $it") }
            c.checkBank?.let { checkParts.add("Banque: $it") }
            c.checkAmount?.let { checkParts.add("${it.toInt()} DH") }
            b.checkInfo.text = checkParts.joinToString("  ·  ")
        } else {
            b.checkSection.visibility = View.GONE
        }

        val signed = c.signedAt != null
        val closed = c.closedAt != null
        val (label, color) = when {
            closed -> "Clôturé" to R.color.muted
            signed -> "Signé" to R.color.green
            else -> "En cours" to R.color.navy
        }
        b.status.text = label
        b.status.setTextColor(ContextCompat.getColor(this, color))

        renderSignatureFlow(c, signed, closed)
        renderCloseFlow(c, closed)
    }

    private fun renderCloseFlow(c: Contract, closed: Boolean) {
        b.closeSection.visibility = if (closed) View.GONE else View.VISIBLE
        val outKm = c.mileageOut
        if (!closed && b.closeMileageIn.text.isNullOrBlank() && outKm != null) {
            b.closeMileageIn.hint = "Min ${outKm} km"
        }
    }

    // Guided, one-step-at-a-time signature flow. Only the relevant actions for the
    // current contract state are shown — no wall of buttons.
    private fun renderSignatureFlow(c: Contract, signed: Boolean, closed: Boolean) {
        // Reset collapsibles each render.
        b.signPadSection.visibility = View.GONE
        b.signLinkSection.visibility = View.GONE

        when {
            // ── Signed or closed: nothing to do but read the PDF ──────────────
            signed || closed -> {
                b.signStepTitle.text = if (closed) "Contrat clôturé" else "✓ Contrat signé"
                b.signStepDesc.text = if (closed) {
                    "Location terminée. Le contrat reste consultable."
                } else {
                    "Signé le ${c.signedAt?.take(10) ?: ""}. Vous pouvez télécharger le contrat."
                }
                b.primaryAction.text = "Télécharger le contrat (PDF)"
                b.primaryAction.setBackgroundColor(ContextCompat.getColor(this, R.color.navy))
                b.primaryAction.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_download, 0, 0, 0)
                b.primaryAction.setOnClickListener { previewContract() }
                b.secondaryActions.visibility = View.GONE
                b.viewPdfButton.visibility = View.GONE // primary already opens the PDF
            }

            // ── Link already sent, awaiting the client's signature ────────────
            c.signToken != null -> {
                b.signStepTitle.text = "En attente de signature"
                b.signStepDesc.text = "Le lien a été envoyé. Le client peut signer via le lien ou le QR ci-dessous."
                b.primaryAction.text = "Renvoyer via WhatsApp"
                b.primaryAction.setBackgroundColor(ContextCompat.getColor(this, R.color.green))
                b.primaryAction.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_whatsapp, 0, 0, 0)
                b.primaryAction.setOnClickListener { sendViaWhatsapp() }

                b.secondaryActions.visibility = View.VISIBLE
                b.secondaryA.text = "Partager le lien"
                b.secondaryA.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_send, 0, 0, 0)
                b.secondaryA.setOnClickListener { sendToClient() }
                b.secondaryB.text = "Signer sur place"
                b.secondaryB.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_sign, 0, 0, 0)
                b.secondaryB.setBackgroundColor(ContextCompat.getColor(this, R.color.muted))
                b.secondaryB.setOnClickListener { toggleSignPad() }

                b.viewPdfButton.visibility = View.VISIBLE
                showSignLink() // shows QR + link inline
            }

            // ── Fresh contract: choose how to get it signed ───────────────────
            else -> {
                b.signStepTitle.text = "Pas encore signé"
                b.signStepDesc.text = "Envoyez le contrat au client pour signature à distance, ou faites-le signer ici."
                b.primaryAction.text = "Envoyer au client (WhatsApp)"
                b.primaryAction.setBackgroundColor(ContextCompat.getColor(this, R.color.green))
                b.primaryAction.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_whatsapp, 0, 0, 0)
                b.primaryAction.setOnClickListener { sendViaWhatsapp() }

                b.secondaryActions.visibility = View.VISIBLE
                b.secondaryA.text = "Signer sur place"
                b.secondaryA.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_sign, 0, 0, 0)
                b.secondaryA.setOnClickListener { toggleSignPad() }
                b.secondaryB.text = "Partager le lien"
                b.secondaryB.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_send, 0, 0, 0)
                b.secondaryB.setOnClickListener { sendToClient() }

                b.viewPdfButton.visibility = View.VISIBLE
            }
        }
    }

    private fun toggleSignPad() {
        b.signPadSection.visibility =
            if (b.signPadSection.visibility == View.VISIBLE) View.GONE else View.VISIBLE
    }

    private fun showSignLink() {
        val url = signUrl ?: return
        b.signLinkSection.visibility = View.VISIBLE
        b.signLink.text = url
        QrGen.encode(url)?.let { b.qrCode.setImageBitmap(it) }
    }

    private fun copySignLink() {
        val url = signUrl ?: return
        val cb = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cb.setPrimaryClip(android.content.ClipData.newPlainText("sign_link", url))
        Toast.makeText(this, "Lien copié", Toast.LENGTH_SHORT).show()
    }

    private fun fuelLabel(v: String?): String = when (v) {
        "empty" -> "Vide"
        "quarter" -> "1/4"
        "half" -> "1/2"
        "three_quarters" -> "3/4"
        "full" -> "Plein"
        else -> v ?: "—"
    }

    private fun confirmCloseContract() {
        val c = contract ?: return
        val mileageIn = b.closeMileageIn.text.toString().toIntOrNull()
        if (mileageIn == null) {
            Toast.makeText(this, "Kilometrage retour obligatoire", Toast.LENGTH_SHORT).show()
            return
        }
        val mileageOut = c.mileageOut
        if (mileageOut != null && mileageIn < mileageOut) {
            Toast.makeText(this, "Km retour inferieur au km depart", Toast.LENGTH_SHORT).show()
            return
        }
        MaterialAlertDialogBuilder(this)
            .setTitle("Cloturer ce contrat ?")
            .setMessage("La reservation sera fermee et la voiture sera remise disponible avec le nouveau kilometrage.")
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton("Cloturer") { _, _ -> closeContract(mileageIn) }
            .show()
    }

    private fun closeContract(mileageIn: Int) {
        val c = contract ?: return
        val fuelIn = fuelLevels.getOrElse(b.closeFuelIn.selectedItemPosition) { "full" }
        b.progress.visibility = View.VISIBLE
        b.closeContractButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val contractRes = SupabaseClient.rest.updateContract(
                    "eq.${c.id}",
                    mapOf(
                        "mileage_in" to mileageIn,
                        "fuel_in" to fuelIn,
                        "closed_at" to java.time.Instant.now().toString(),
                    ),
                )
                if (!contractRes.isSuccessful) {
                    Toast.makeText(this@ContractDetailActivity, "Erreur contrat ${contractRes.code()}", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                c.reservationId?.let {
                    SupabaseClient.rest.updateReservationStatus("eq.$it", mapOf("status" to "closed"))
                }
                c.reservations?.vehicles?.id?.let { vehicleId ->
                    SupabaseClient.rest.updateVehicle(
                        "eq.$vehicleId",
                        mapOf(
                            "mileage_current" to mileageIn,
                            "status" to "available",
                        ),
                    )
                }

                Notify.enqueue(
                    SessionManager(this@ContractDetailActivity).agencyId,
                    "contract_closed",
                    mapOf(
                        "contract_id" to c.id,
                        "client" to c.reservations?.clients?.fullName,
                        "vehicle" to c.reservations?.vehicles?.displayName,
                        "plate" to c.reservations?.vehicles?.plate,
                        "mileage_in" to mileageIn,
                        "fuel_in" to fuelLabel(fuelIn),
                    ),
                )
                Toast.makeText(this@ContractDetailActivity, "Contrat cloture", Toast.LENGTH_SHORT).show()
                loadContract()
            } catch (e: Exception) {
                Toast.makeText(this@ContractDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
                b.closeContractButton.isEnabled = true
            }
        }
    }

    private fun signContract() {
        val c = contract ?: return
        if (b.signatureView.isEmpty()) {
            Toast.makeText(this, "Veuillez signer d'abord", Toast.LENGTH_SHORT).show()
            return
        }

        b.progress.visibility = View.VISIBLE
        b.signButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val body = mapOf<String, Any?>(
                    "signed_at" to java.time.Instant.now().toString(),
                )
                val res = SupabaseClient.rest.updateContract("eq.${c.id}", body)
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    Toast.makeText(this@ContractDetailActivity, "Contrat signé", Toast.LENGTH_SHORT).show()
                    Notify.enqueue(
                        SessionManager(this@ContractDetailActivity).agencyId,
                        "contract_signed",
                        mapOf(
                            "contract_id" to c.id,
                            "client" to c.reservations?.clients?.fullName,
                            "plate" to c.reservations?.vehicles?.plate,
                            "signed_by" to "agence",
                        ),
                    )
                    loadContract()
                } else {
                    b.signButton.isEnabled = true
                    Toast.makeText(this@ContractDetailActivity, "Erreur", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                b.signButton.isEnabled = true
                Toast.makeText(this@ContractDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun sendToClient() {
        val c = contract ?: return
        ensureSignToken(c) { token -> shareSignLink(token, c.shortId) }
    }

    private fun sendViaWhatsapp() {
        val c = contract ?: return
        ensureSignToken(c) { token ->
            val phone = c.reservations?.clients?.phone?.replace(Regex("\\D"), "").orEmpty()
            val message = buildClientMessage(c, "${BuildConfig.WEBAPP_BASE_URL}/sign/$token")
            if (phone.isBlank()) {
                shareText(message)
                return@ensureSignToken
            }
            val encoded = URLEncoder.encode(message, "UTF-8")
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone?text=$encoded")))
        }
    }

    private fun ensureSignToken(c: Contract, onReady: (String) -> Unit) {
        c.signToken?.let {
            onReady(it)
            return
        }

        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val newToken = java.util.UUID.randomUUID().toString().replace("-", "").take(32)
                val expires = java.time.Instant.now().plusSeconds(7 * 24 * 3600).toString()
                val body = mapOf<String, Any?>(
                    "sign_token" to newToken,
                    "sign_token_expires" to expires,
                )
                val res = SupabaseClient.rest.updateContract("eq.${c.id}", body)
                b.progress.visibility = View.GONE
                if (res.isSuccessful) {
                    contract = contract?.copy(signToken = newToken)
                    showSignLink()
                    onReady(newToken)
                } else {
                    Toast.makeText(this@ContractDetailActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                Toast.makeText(this@ContractDetailActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun shareSignLink(token: String, shortId: String?) {
        val url = "${BuildConfig.WEBAPP_BASE_URL}/sign/$token"
        shareText("Signez votre contrat de location ici:\n$url", "Contrat #${shortId ?: ""}")
    }

    private fun shareText(text: String, subject: String = "Contrat de location") {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(shareIntent, "Envoyer au client"))
    }

    private fun buildClientMessage(c: Contract, url: String): String {
        val client = c.reservations?.clients?.fullName.orEmpty()
        val vehicle = listOfNotNull(c.reservations?.vehicles?.brand, c.reservations?.vehicles?.model)
            .joinToString(" ")
            .ifBlank { c.reservations?.vehicles?.plate.orEmpty() }
        return "Bonjour $client, merci de signer votre contrat de location $vehicle ici:\n$url"
    }

    // Open the SAME server-rendered PDF the web app produces, shown in-app with
    // PdfRenderer (no web redirect, no re-login). Identical design, signature baked in.
    private fun previewContract() {
        val c = contract ?: return
        val title = "Contrat_${c.shortId ?: c.id.take(8)}"
        startActivity(
            Intent(this, ContractPdfActivity::class.java)
                .putExtra("contract_id", c.id)
                .putExtra("contract_title", title),
        )
    }
}
