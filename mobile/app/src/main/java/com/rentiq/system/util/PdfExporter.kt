package com.rentiq.system.util

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import androidx.core.content.FileProvider
import java.io.File

// Renders an on-screen View to a paginated A4 PDF, fully offline, and saves it
// to the device Downloads (Android Q+) or the app's external files dir (older).
// Returns a viewable/shareable content Uri, or null on failure.
object PdfExporter {
    // A4 at 72 dpi (PostScript points).
    private const val PAGE_W = 595
    private const val PAGE_H = 842
    private const val MARGIN = 24

    fun export(context: Context, content: View, fileName: String): Uri? {
        val viewW = content.width
        val viewH = content.height
        if (viewW <= 0 || viewH <= 0) return null

        val usableW = PAGE_W - MARGIN * 2
        val usableH = PAGE_H - MARGIN * 2
        val scale = usableW.toFloat() / viewW
        val scaledTotalH = viewH * scale
        val pageCount = Math.ceil(scaledTotalH / usableH.toDouble()).toInt().coerceAtLeast(1)
        // How many source pixels fit on one page.
        val srcPageH = (usableH / scale)

        // Render the whole view ONCE onto a software (ARGB_8888) bitmap. PDF page
        // canvases are software and cannot draw hardware bitmaps; going through a
        // software bitmap first avoids "Software rendering doesn't support
        // hardware bitmaps" crashes from image content (e.g. the agency stamp).
        val doc = PdfDocument()
        try {
            val full = Bitmap.createBitmap(viewW, viewH, Bitmap.Config.ARGB_8888)
            val fullCanvas = Canvas(full)
            fullCanvas.drawColor(Color.WHITE)
            content.draw(fullCanvas)

            val srcPaint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG)
            for (page in 0 until pageCount) {
                val pageInfo = PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, page + 1).create()
                val pdfPage = doc.startPage(pageInfo)
                val canvas = pdfPage.canvas
                canvas.drawColor(Color.WHITE)
                val srcTop = (page * srcPageH).toInt().coerceIn(0, viewH)
                val srcBottom = ((page + 1) * srcPageH).toInt().coerceIn(0, viewH)
                if (srcBottom > srcTop) {
                    val src = android.graphics.Rect(0, srcTop, viewW, srcBottom)
                    val dstH = (srcBottom - srcTop) * scale
                    val dst = android.graphics.RectF(
                        MARGIN.toFloat(), MARGIN.toFloat(),
                        (MARGIN + usableW).toFloat(), MARGIN + dstH,
                    )
                    canvas.drawBitmap(full, src, dst, srcPaint)
                }
                doc.finishPage(pdfPage)
            }
            val uri = write(context, doc, fileName)
            full.recycle()
            return uri
        } catch (t: Throwable) {
            return null
        } finally {
            doc.close()
        }
    }

    private fun write(context: Context, doc: PdfDocument, fileName: String): Uri? {
        val safeName = if (fileName.endsWith(".pdf")) fileName else "$fileName.pdf"
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                put(MediaStore.Downloads.MIME_TYPE, "application/pdf")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
            resolver.openOutputStream(uri)?.use { doc.writeTo(it) }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            uri
        } else {
            val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "contracts")
            if (!dir.exists()) dir.mkdirs()
            val file = File(dir, safeName)
            file.outputStream().use { doc.writeTo(it) }
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        }
    }
}
