package com.rentiq.system.ui.reports

import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.BuildConfig
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.databinding.ActivityReportsBinding
import kotlinx.coroutines.launch
import java.io.File

class ReportsActivity : AppCompatActivity() {
    private lateinit var b: ActivityReportsBinding
    private var reservations = listOf<Reservation>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityReportsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        b.shareCsv.setOnClickListener { shareCsv() }
        b.sharePdf.setOnClickListener { sharePdf() }
        b.openWebReports.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.WEBAPP_BASE_URL}/finance")))
        }
        load()
    }

    private fun load() {
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = SupabaseClient.rest.getReservations()
                if (res.isSuccessful) {
                    reservations = res.body() ?: emptyList()
                    renderSummary()
                } else {
                    Toast.makeText(this@ReportsActivity, "Erreur ${res.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ReportsActivity, "Erreur: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun renderSummary() {
        val active = reservations.count { it.status !in setOf("cancelled", "blocked") }
        val total = reservations.filter { it.status !in setOf("cancelled", "blocked", "pending") }
            .sumOf { it.totalAmount ?: 0.0 }
        b.summary.text = "$active reservations - ${total.toInt()} DH"
        b.details.text = "Exports mobiles: CSV comptable et PDF resume. Les rapports web restent disponibles pour les vues avancees."
    }

    private fun shareCsv() {
        if (reservations.isEmpty()) {
            Toast.makeText(this, "Aucune reservation a exporter", Toast.LENGTH_SHORT).show()
            return
        }
        val header = "Start,End,Vehicle,Client,Status,Total MAD"
        val rows = reservations.joinToString("\n") { r ->
            listOf(
                r.dateStart,
                r.dateEnd,
                r.vehicles?.plate,
                r.clients?.fullName,
                r.status,
                r.totalAmount?.toInt()?.toString(),
            ).joinToString(",") { csv(it) }
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_SUBJECT, "rapport-reservations.csv")
            putExtra(Intent.EXTRA_TEXT, "$header\n$rows")
        }
        startActivity(Intent.createChooser(intent, "Partager rapport"))
    }

    private fun sharePdf() {
        if (reservations.isEmpty()) {
            Toast.makeText(this, "Aucune reservation a exporter", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val file = buildPdf()
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_SUBJECT, "rapport-reservations.pdf")
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Partager PDF"))
        } catch (e: Exception) {
            Toast.makeText(this, "Erreur PDF: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun buildPdf(): File {
        val dir = File(cacheDir, "reports").apply { mkdirs() }
        val file = File(dir, "rapport-reservations.pdf")
        val pdf = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdf.startPage(pageInfo)
        val canvas = page.canvas
        val title = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12f }
        val muted = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 11f
            color = 0xFF64748B.toInt()
        }
        var y = 48f
        canvas.drawText("Rapport reservations", 40f, y, title)
        y += 26f
        val total = reservations.filter { it.status !in setOf("cancelled", "blocked", "pending") }
            .sumOf { it.totalAmount ?: 0.0 }
        canvas.drawText("${reservations.size} reservations - ${total.toInt()} DH", 40f, y, muted)
        y += 32f
        canvas.drawText("Debut", 40f, y, muted)
        canvas.drawText("Fin", 125f, y, muted)
        canvas.drawText("Vehicule", 210f, y, muted)
        canvas.drawText("Client", 315f, y, muted)
        canvas.drawText("Total", 500f, y, muted)
        y += 18f
        reservations.take(32).forEach { r ->
            canvas.drawText(r.dateStart?.take(10).orEmpty(), 40f, y, text)
            canvas.drawText(r.dateEnd?.take(10).orEmpty(), 125f, y, text)
            canvas.drawText((r.vehicles?.plate ?: "-").take(12), 210f, y, text)
            canvas.drawText((r.clients?.fullName ?: "-").take(24), 315f, y, text)
            canvas.drawText("${(r.totalAmount ?: 0.0).toInt()}", 500f, y, text)
            y += 20f
        }
        if (reservations.size > 32) {
            canvas.drawText("+ ${reservations.size - 32} autres lignes dans l'export CSV", 40f, y + 12f, muted)
        }
        pdf.finishPage(page)
        file.outputStream().use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    private fun csv(value: String?): String = "\"${value.orEmpty().replace("\"", "\"\"")}\""
}
