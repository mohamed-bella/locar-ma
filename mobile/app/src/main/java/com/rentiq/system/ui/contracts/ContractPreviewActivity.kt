package com.rentiq.system.ui.contracts

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import coil.load
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.AgencyProfile
import com.rentiq.system.data.model.Contract
import com.rentiq.system.databinding.ActivityContractPreviewBinding
import com.rentiq.system.databinding.PdfFieldBinding
import com.rentiq.system.util.PdfExporter
import com.rentiq.system.util.SessionManager
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// In-app replica of the web Moroccan bilingual (FR/AR) rental contract
// (src/components/pdf/ContractPDF.tsx). Renders to a PDF saved in Downloads.
class ContractPreviewActivity : AppCompatActivity() {
    private lateinit var b: ActivityContractPreviewBinding
    private var contract: Contract? = null

    private val FUEL_LEVEL = mapOf(
        "empty" to 0, "quarter" to 1, "half" to 2, "three_quarters" to 3, "full" to 4,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityContractPreviewBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        b.downloadButton.setOnClickListener { export(share = false) }
        b.shareButton.setOnClickListener { export(share = true) }
        load()
    }

    private fun load() {
        val contractId = intent.getStringExtra("contract_id") ?: run { finish(); return }
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val agencyId = SessionManager(this@ContractPreviewActivity).agencyId
                val cCall = async { SupabaseClient.rest.getContract("eq.$contractId") }
                val aCall = agencyId?.let { async { SupabaseClient.rest.getAgency("eq.$it") } }
                val c = cCall.await().body()
                val a = aCall?.await()?.body()
                b.progress.visibility = View.GONE
                if (c == null) { toast("Contrat introuvable"); finish(); return@launch }
                contract = c
                bind(c, a)
            } catch (e: Exception) {
                b.progress.visibility = View.GONE
                toast("Erreur: ${e.message}")
            }
        }
    }

    private fun bind(c: Contract, a: AgencyProfile?) {
        val f = c.form ?: emptyMap()
        val cl = c.reservations?.clients
        val v = c.reservations?.vehicles
        val r = c.reservations
        val legalName = a?.legalName?.ifBlank { null } ?: a?.name ?: "Agence"

        // Header — logo (prefer image) + name
        b.agencyName.text = a?.name ?: "Agence"
        val logo = a?.logoUrl
        if (!logo.isNullOrBlank()) {
            val logoUrl = if (logo.startsWith("http")) logo else "${BuildConfig.R2_PUBLIC_URL}/$logo"
            b.agencyLogo.visibility = android.view.View.VISIBLE
            b.agencyLogo.load(logoUrl) { allowHardware(false) }
        }

        // Right: legal name + ICE / RC / Patente / RIB / GSM
        b.agencyLegalName.text = legalName
        val legalBits = listOfNotNull(
            a?.ice?.let { "ICE: $it" }, a?.rc?.let { "RC: $it" },
            a?.patente?.let { "Patente: $it" }, a?.rib?.let { "RIB: $it" },
            a?.companyPhone?.let { "GSM: $it" },
            a?.address,
        )
        b.agencyLegalLines.text = legalBits.joinToString("\n")

        b.contractNo.text = c.shortId ?: c.id.take(8)

        // Client grid (mirrors web field order + FR/AR labels)
        fillGrid(b.clientGrid, listOf(
            Field("Cin Client", "رقم البطاقة الوطنية", cl?.cin),
            Field("Expiration Cin", "صالحة إلى غاية", f["client_cin_expiry"]),
            Field("Nom Client", "الإسم العائلي", f["client_nom"] ?: cl?.fullName),
            Field("Prénom Client", "الإسم الشخصي", f["client_prenom"]),
            Field("Date De Naissance", "تاريخ الإزدياد", f["client_birthdate"]),
            Field("Profession", "المهنة", f["client_profession"]),
            Field("Num Pérmis", "رقم رخصة السياقة", f["client_permit_number"]),
            Field("Date de Permis", "تاريخ رخصة السياقة", f["client_permit_date"]),
            Field("Lieu délivrance Permis", "مسلمة بـ", f["client_permit_place"]),
            Field("Téléphone 1", "الهاتف", cl?.phone),
            Field("Adresse", "العنوان", cl?.address),
            Field("Téléphone 2", "الهاتف", f["client_phone2"]),
            Field("Ville", "المدينة", f["client_ville"]),
            Field("Nationalité", "الجنسية", cl?.nationality),
        ))

        // 2nd driver grid
        fillGrid(b.d2Grid, listOf(
            Field("Cin 2ème conducteur", "رقم البطاقة", f["d2_cin"]),
            Field("Date d'Expiration Cin", "صالحة إلى غاية", f["d2_cin_expiry"]),
            Field("Nom 2ème conducteur", "الإسم العائلي", f["d2_nom"]),
            Field("Prénom 2ème", "الإسم الشخصي", f["d2_prenom"]),
            Field("Date De Naissance", "تاريخ الإزدياد", f["d2_birthdate"]),
            Field("Profession", "المهنة", f["d2_profession"]),
            Field("Num Pérmis", "رقم رخصة السياقة", f["d2_permit_number"]),
            Field("Date de Permis", "تاريخ رخصة السياقة", f["d2_permit_date"]),
            Field("Lieu délivrance Permis", "مسلمة بـ", f["d2_permit_place"]),
            Field("Téléphone", "الهاتف", f["d2_phone"]),
            Field("Adresse", "العنوان", f["d2_address"]),
            Field("Ville", "المدينة", f["d2_ville"]),
        ))

        // Vehicle
        fillGrid(b.vehicleGrid, listOf(
            Field("Matricule", "رقم اللوحة", v?.plate),
            Field("Marque", "المُصنع", v?.brand),
            Field("Type", "النوع", v?.model),
            Field("Année", "السنة", v?.year?.toString()),
        ))

        // Fuel gauge
        buildFuelGauge(c.fuelOut?.let { FUEL_LEVEL[it] } ?: 0)

        // Réglement
        val nDays = daysBetween(r?.dateStart, r?.dateEnd)
        fillGrid(b.reglementGrid, listOf(
            Field("Durée", "المدة", "$nDays Jour${if (nDays > 1) "s" else ""}"),
            Field("Prix par jour", "الثمن اليومي", money(r?.dailyRate)),
            Field("Date départ", "تاريخ الإنطلاق", fmtDate(r?.dateStart)),
            Field("Heure départ", "ساعة الإنطلاق", f["heure_depart"]),
            Field("Date retour", "تاريخ الرجوع", fmtDate(r?.dateEnd)),
            Field("Heure retour", "ساعة الرجوع", f["heure_retour"]),
        ))
        b.totalValue.text = money(r?.totalAmount)

        // Fait à … le …
        b.faitLabel.text = "Fait à ${a?.city ?: "__________"} le :"
        b.faitValue.text = fmtDate(r?.dateStart)

        // Client signature — actual PNG when available, else signed date text
        val signUrl = c.signatureUrl ?: f["signature_url"]
        if (!signUrl.isNullOrBlank()) {
            val fullSignUrl = if (signUrl.startsWith("http")) signUrl else "${BuildConfig.R2_PUBLIC_URL}/$signUrl"
            b.clientSignImg.visibility = android.view.View.VISIBLE
            b.clientSignImg.load(fullSignUrl) { allowHardware(false) }
        }
        if (c.signedAt != null) {
            b.clientSign.text = "Signé en ligne · ${fmtDateTime(c.signedAt)}"
        }

        // Agency stamp
        val stamp = a?.stampUrl
        if (!stamp.isNullOrBlank()) {
            val url = if (stamp.startsWith("http")) stamp else "${BuildConfig.R2_PUBLIC_URL}/$stamp"
            b.stampImage.visibility = View.VISIBLE
            b.stampImage.load(url) { allowHardware(false) }
        }

        // Footer
        b.footerText.text = buildString {
            append(legalName)
            a?.address?.let { append(" — $it") }
            if (legalBits.isNotEmpty()) append("\n" + legalBits.joinToString("  |  "))
        }
    }

    private data class Field(val fr: String, val ar: String, val value: String?)

    // Lay out fields two-per-row (each 50%), matching the web grid.
    private fun fillGrid(grid: LinearLayout, fields: List<Field>) {
        grid.removeAllViews()
        val inflater = LayoutInflater.from(this)
        var i = 0
        while (i < fields.size) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                )
                weightSum = 2f
            }
            addFieldCell(row, inflater, fields[i])
            if (i + 1 < fields.size) addFieldCell(row, inflater, fields[i + 1])
            else row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
            grid.addView(row)
            i += 2
        }
    }

    private fun addFieldCell(row: LinearLayout, inflater: LayoutInflater, field: Field) {
        val fb = PdfFieldBinding.inflate(inflater, row, false)
        fb.fieldFr.text = field.fr
        fb.fieldAr.text = field.ar
        fb.fieldValue.text = field.value?.ifBlank { " " } ?: " "
        val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        row.addView(fb.root, lp)
    }

    private fun buildFuelGauge(level: Int) {
        val gauge = b.fuelGauge
        gauge.removeAllViews()
        val navy = ContextCompat.getColor(this, R.color.pdf_navy)
        val soft = ContextCompat.getColor(this, R.color.pdf_navy_soft)
        // Outer border via background stroke drawable-less: use a bordered container.
        gauge.setBackgroundColor(navy)
        gauge.setPadding(dp(1), dp(1), dp(1), dp(1))
        for (i in 0 until 4) {
            val cell = View(this)
            cell.setBackgroundColor(if (i < level) soft else Color.WHITE)
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
            if (i < 3) lp.marginEnd = dp(1)
            gauge.addView(cell, lp)
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun money(n: Double?): String = "${(n ?: 0.0).toInt()} DH"

    private fun daysBetween(a: String?, bb: String?): Long {
        val s = a?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return 1
        val e = bb?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return 1
        return ChronoUnit.DAYS.between(s, e).coerceAtLeast(1)
    }

    private fun fmtDate(d: String?): String {
        val date = d?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return ""
        return date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }

    private fun fmtDateTime(d: String?): String {
        d ?: return ""
        val date = runCatching { LocalDate.parse(d.take(10)) }.getOrNull() ?: return d.take(10)
        return date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }

    private fun export(share: Boolean) {
        val c = contract ?: return
        val name = "Contrat_${c.shortId ?: c.id.take(8)}"
        val uri = try {
            PdfExporter.export(this, b.documentRoot, name)
        } catch (t: Throwable) {
            android.util.Log.e("ContractPdf", "export failed", t); null
        }
        if (uri == null) { toast("Échec de génération PDF"); return }
        if (share) {
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, "Partager le contrat"))
        } else {
            toast("PDF enregistré dans Téléchargements")
            try {
                startActivity(Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/pdf")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                })
            } catch (e: Exception) { /* no PDF viewer installed */ }
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
