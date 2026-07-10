package com.rentiq.system.ui.contracts

import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.databinding.ActivityContractPdfBinding
import com.rentiq.system.util.ContractPdfApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

// Shows the SAME PDF the web app generates — fetched from the server, rendered
// in-app with PdfRenderer. No browser redirect, no re-login. Share + download.
class ContractPdfActivity : AppCompatActivity() {
    private lateinit var b: ActivityContractPdfBinding
    private var contractId: String? = null
    private var pdfFile: File? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityContractPdfBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }

        contractId = intent.getStringExtra("contract_id")
        intent.getStringExtra("contract_title")?.let { b.toolbar.title = it }

        b.retryButton.setOnClickListener { load(force = false) }
        b.refreshButton.setOnClickListener { load(force = true) } // regenerate (e.g. after signing)
        b.shareButton.setOnClickListener { share() }
        b.downloadButton.setOnClickListener { saveToDownloads() }

        load(force = false)
    }

    private fun load(force: Boolean) {
        val id = contractId ?: run { toast("Contrat introuvable"); finish(); return }
        showLoading(if (force) "Régénération du contrat…" else "Génération du contrat…")
        lifecycleScope.launch {
            val result = ContractPdfApi.fetch(this@ContractPdfActivity, id, force)
            if (result.file == null) {
                showError(result.error ?: "Erreur inconnue")
                return@launch
            }
            pdfFile = result.file
            renderPdf(result.file)
        }
    }

    private suspend fun renderPdf(file: File) {
        try {
            // Render each page to a bitmap off the main thread.
            val bitmaps = withContext(Dispatchers.Default) {
                val out = mutableListOf<Bitmap>()
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                    PdfRenderer(pfd).use { renderer ->
                        val targetW = resources.displayMetrics.widthPixels.coerceAtMost(1600)
                        for (i in 0 until renderer.pageCount) {
                            renderer.openPage(i).use { page ->
                                val scale = targetW.toFloat() / page.width
                                val w = targetW
                                val h = (page.height * scale).toInt().coerceAtLeast(1)
                                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(Color.WHITE)
                                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                out.add(bmp)
                            }
                        }
                    }
                }
                out
            }

            b.pageContainer.removeAllViews()
            val marginPx = (10 * resources.displayMetrics.density).toInt()
            bitmaps.forEach { bmp ->
                val iv = ImageView(this).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { bottomMargin = marginPx }
                    adjustViewBounds = true
                    setImageBitmap(bmp)
                }
                b.pageContainer.addView(iv)
            }
            showContent()
        } catch (e: Exception) {
            showError("Affichage impossible: ${e.message}")
        }
    }

    // ── Share / Download ────────────────────────────────────────────────────

    private fun share() {
        val file = pdfFile ?: return
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Partager le contrat"))
    }

    private fun saveToDownloads() {
        val file = pdfFile ?: return
        val name = (intent.getStringExtra("contract_title") ?: "Contrat_${contractId?.take(8)}")
            .replace(Regex("[^A-Za-z0-9_-]+"), "_") + ".pdf"
        try {
            val savedUri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: run { toast("Échec enregistrement"); return }
                resolver.openOutputStream(uri)?.use { it.write(file.readBytes()) }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                uri
            } else {
                val dir = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "contracts").apply { mkdirs() }
                val dest = File(dir, name)
                dest.writeBytes(file.readBytes())
                FileProvider.getUriForFile(this, "$packageName.fileprovider", dest)
            }
            toast("PDF enregistré dans Téléchargements")
            try {
                startActivity(Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(savedUri, "application/pdf")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                })
            } catch (_: Exception) { /* no external viewer installed */ }
        } catch (e: Exception) {
            toast("Erreur: ${e.message}")
        }
    }

    // ── UI states ───────────────────────────────────────────────────────────

    private fun showLoading(msg: String) {
        b.stateBox.visibility = View.VISIBLE
        b.progress.visibility = View.VISIBLE
        b.retryButton.visibility = View.GONE
        b.stateText.text = msg
        b.ctaBar.visibility = View.GONE
        b.pageScroll.visibility = View.GONE
    }

    private fun showError(msg: String) {
        b.stateBox.visibility = View.VISIBLE
        b.progress.visibility = View.GONE
        b.retryButton.visibility = View.VISIBLE
        b.stateText.text = msg
        b.ctaBar.visibility = View.GONE
        b.pageScroll.visibility = View.GONE
    }

    private fun showContent() {
        b.stateBox.visibility = View.GONE
        b.pageScroll.visibility = View.VISIBLE
        b.ctaBar.visibility = View.VISIBLE
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
