package com.rentiq.system.ui.reports

import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.rentiq.system.BuildConfig
import com.rentiq.system.R
import com.rentiq.system.data.api.SupabaseClient
import com.rentiq.system.data.model.Reservation
import com.rentiq.system.data.model.ServiceRecord
import com.rentiq.system.data.model.VehicleExpense
import com.rentiq.system.data.model.VehicleIssue
import com.rentiq.system.databinding.ActivityReportsBinding
import com.rentiq.system.util.AuthSession
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.TemporalAdjusters
import java.util.Locale

class ReportsActivity : AppCompatActivity() {
    private lateinit var b: ActivityReportsBinding
    private var reservations = listOf<Reservation>()
    private var serviceRecords = listOf<ServiceRecord>()
    private var expenses = listOf<VehicleExpense>()
    private var issues = listOf<VehicleIssue>()
    private var report: FinanceReport? = null

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
                val reservationsCall = async { SupabaseClient.rest.getReservations() }
                val servicesCall = async { SupabaseClient.rest.getAllServiceRecords() }
                val expensesCall = async { SupabaseClient.rest.getAllVehicleExpenses() }
                val issuesCall = async { SupabaseClient.rest.getAllVehicleIssues() }

                val reservationsRes = reservationsCall.await()
                val servicesRes = servicesCall.await()
                val expensesRes = expensesCall.await()
                val issuesRes = issuesCall.await()

                if (
                    AuthSession.isAuthError(reservationsRes.code()) ||
                    AuthSession.isAuthError(servicesRes.code()) ||
                    AuthSession.isAuthError(expensesRes.code()) ||
                    AuthSession.isAuthError(issuesRes.code())
                ) {
                    AuthSession.returnToLogin(this@ReportsActivity)
                    return@launch
                }

                reservations = reservationsRes.body().orEmpty()
                serviceRecords = servicesRes.body().orEmpty()
                expenses = expensesRes.body().orEmpty()
                issues = issuesRes.body().orEmpty()

                if (!reservationsRes.isSuccessful) toast(AuthSession.messageFor(reservationsRes.code()))
                if (!servicesRes.isSuccessful) toast("Suivi non charge: ${servicesRes.code()}")
                if (!expensesRes.isSuccessful) toast("Depenses non chargees: ${expensesRes.code()}")
                if (!issuesRes.isSuccessful) toast("Incidents non charges: ${issuesRes.code()}")

                report = buildReport()
                renderReport(report!!)
            } catch (e: Exception) {
                toast("Erreur: ${e.message}")
            } finally {
                b.progress.visibility = View.GONE
            }
        }
    }

    private fun buildReport(): FinanceReport {
        val now = LocalDate.now()
        val weekStart = now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val weekEnd = now.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
        val month = YearMonth.from(now)
        val months = (5 downTo 0).map { YearMonth.from(now.minusMonths(it.toLong())) }
        val revenueRows = reservations.filter { it.status.orEmpty() !in ignoredRevenueStatuses }

        var todayRevenue = 0.0
        var weekRevenue = 0.0
        var monthRevenue = 0.0
        var totalRevenue = 0.0
        val monthlyRevenue = linkedMapOf<YearMonth, Double>().apply {
            months.forEach { put(it, 0.0) }
        }
        val byVehicle = linkedMapOf<String, RankRow>()
        val byClient = linkedMapOf<String, RankRow>()

        revenueRows.forEach { reservation ->
            val start = parseDate(reservation.dateStart)
            val amount = reservation.totalAmount ?: 0.0
            totalRevenue += amount
            if (start == now) todayRevenue += amount
            if (start != null && !start.isBefore(weekStart) && !start.isAfter(weekEnd)) weekRevenue += amount
            if (start != null && YearMonth.from(start) == month) monthRevenue += amount
            if (start != null && monthlyRevenue.containsKey(YearMonth.from(start))) {
                val key = YearMonth.from(start)
                monthlyRevenue[key] = (monthlyRevenue[key] ?: 0.0) + amount
            }

            val vehicleLabel = reservation.vehicles?.displayName ?: reservation.vehicles?.plate ?: "Vehicule"
            accumulate(byVehicle, reservation.vehicleId ?: vehicleLabel, vehicleLabel, amount)
            val clientLabel = reservation.clients?.fullName ?: "Client"
            accumulate(byClient, reservation.clientId ?: clientLabel, clientLabel, amount)
        }

        val serviceCosts = serviceRecords.sumOf { it.cost ?: 0.0 }
        val expenseCosts = expenses.sumOf { it.amount ?: 0.0 }
        val issueCosts = issues.sumOf { it.cost ?: 0.0 }
        val totalCosts = serviceCosts + expenseCosts + issueCosts
        val liveRows = reservations.filter { it.status.orEmpty() !in setOf("cancelled", "blocked") }
        val upcoming = liveRows
            .filter { it.status.orEmpty() in setOf("confirmed", "active") }
            .filter { (parseDate(it.dateEnd) ?: LocalDate.MIN) >= now }
            .sortedBy { parseDate(it.dateEnd) ?: LocalDate.MAX }
            .take(6)
        val overdue = liveRows
            .filter { it.status.orEmpty() in setOf("confirmed", "active") }
            .filter { (parseDate(it.dateEnd) ?: LocalDate.MAX) < now }
            .sortedBy { parseDate(it.dateEnd) ?: LocalDate.MAX }

        return FinanceReport(
            todayRevenue = todayRevenue,
            weekRevenue = weekRevenue,
            monthRevenue = monthRevenue,
            totalRevenue = totalRevenue,
            serviceCosts = serviceCosts,
            expenseCosts = expenseCosts,
            issueCosts = issueCosts,
            totalCosts = totalCosts,
            netProfit = totalRevenue - totalCosts,
            chart = monthlyRevenue.map { (m, value) -> monthLabel(m) to value },
            topVehicles = byVehicle.values.sortedByDescending { it.amount }.take(6),
            topClients = byClient.values.sortedByDescending { it.amount }.take(6),
            upcomingReturns = upcoming,
            overdueReturns = overdue,
        )
    }

    private fun renderReport(report: FinanceReport) {
        b.summary.text = money(report.monthRevenue)
        b.details.text = "CA du mois - ${reservations.size} reservations - ${serviceRecords.size + expenses.size + issues.size} lignes de cout"
        b.todayRevenue.text = "Aujourd'hui\n${money(report.todayRevenue)}"
        b.weekRevenue.text = "Semaine\n${money(report.weekRevenue)}"
        b.monthRevenue.text = "Mois\n${money(report.monthRevenue)}"
        b.totalRevenue.text = "CA total\n${money(report.totalRevenue)}"
        b.netProfit.text = "Marge nette\n${money(report.netProfit)}"
        b.monthlyChart.submit(report.chart)
        b.costBreakdown.text = listOf(
            "Suivi / entretien: ${money(report.serviceCosts)}",
            "Depenses libres: ${money(report.expenseCosts)}",
            "Incidents: ${money(report.issueCosts)}",
            "Total couts: ${money(report.totalCosts)}",
        ).joinToString("\n")
        renderRanks(b.topVehicleList, report.topVehicles, "Aucun vehicule avec revenu")
        renderRanks(b.topClientList, report.topClients, "Aucun client avec revenu")
        b.returnAlerts.text = buildReturnAlerts(report)
    }

    private fun renderRanks(container: LinearLayout, rows: List<RankRow>, empty: String) {
        container.removeAllViews()
        if (rows.isEmpty()) {
            container.addView(simpleText(empty, muted = true))
            return
        }
        rows.forEachIndexed { index, row ->
            container.addView(simpleText("${index + 1}. ${row.label} - ${money(row.amount)} (${row.count})"))
        }
    }

    private fun buildReturnAlerts(report: FinanceReport): String {
        val overdueText = if (report.overdueReturns.isEmpty()) {
            "Aucun retour en retard"
        } else {
            report.overdueReturns.take(5).joinToString("\n") {
                "RETARD - ${it.vehicles?.plate ?: it.vehicles?.displayName ?: "Vehicule"} - ${it.clients?.fullName ?: "Client"} - ${dateLabel(it.dateEnd)}"
            }
        }
        val upcomingText = if (report.upcomingReturns.isEmpty()) {
            "Aucun retour proche"
        } else {
            report.upcomingReturns.joinToString("\n") {
                "A venir - ${it.vehicles?.plate ?: it.vehicles?.displayName ?: "Vehicule"} - ${it.clients?.fullName ?: "Client"} - ${dateLabel(it.dateEnd)}"
            }
        }
        return "$overdueText\n\n$upcomingText"
    }

    private fun shareCsv() {
        val report = report ?: return
        val csvText = buildCsv(report)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_SUBJECT, "rapport-finance.csv")
            putExtra(Intent.EXTRA_TEXT, csvText)
        }
        startActivity(Intent.createChooser(intent, "Partager rapport finance"))
    }

    private fun sharePdf() {
        val report = report ?: return
        try {
            val file = buildPdf(report)
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_SUBJECT, "rapport-finance.pdf")
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Partager PDF"))
        } catch (e: Exception) {
            toast("Erreur PDF: ${e.message}")
        }
    }

    private fun buildCsv(report: FinanceReport): String {
        val lines = mutableListOf<String>()
        lines += listOf("Metric", "Value MAD").joinToString(",") { csv(it) }
        lines += listOf("Revenue today", report.todayRevenue.toInt().toString()).joinToString(",") { csv(it) }
        lines += listOf("Revenue week", report.weekRevenue.toInt().toString()).joinToString(",") { csv(it) }
        lines += listOf("Revenue month", report.monthRevenue.toInt().toString()).joinToString(",") { csv(it) }
        lines += listOf("Revenue total", report.totalRevenue.toInt().toString()).joinToString(",") { csv(it) }
        lines += listOf("Total costs", report.totalCosts.toInt().toString()).joinToString(",") { csv(it) }
        lines += listOf("Net profit", report.netProfit.toInt().toString()).joinToString(",") { csv(it) }
        lines += ""
        lines += listOf("Start", "End", "Vehicle", "Client", "Status", "Total MAD").joinToString(",") { csv(it) }
        reservations.forEach { r ->
            lines += listOf(
                r.dateStart,
                r.dateEnd,
                r.vehicles?.plate ?: r.vehicles?.displayName,
                r.clients?.fullName,
                r.status,
                r.totalAmount?.toInt()?.toString(),
            ).joinToString(",") { csv(it) }
        }
        lines += ""
        lines += listOf("Cost type", "Date", "Vehicle", "Name", "Amount MAD").joinToString(",") { csv(it) }
        serviceRecords.forEach {
            lines += listOf("service", it.performedAt, it.vehicles?.plate ?: it.vehicles?.displayName, it.type, it.cost?.toInt()?.toString()).joinToString(",") { value -> csv(value) }
        }
        expenses.forEach {
            lines += listOf("expense", it.spentAt, it.vehicles?.plate ?: it.vehicles?.displayName, it.name, it.amount?.toInt()?.toString()).joinToString(",") { value -> csv(value) }
        }
        issues.filter { (it.cost ?: 0.0) > 0.0 }.forEach {
            lines += listOf("issue", it.openedAt, it.vehicleId, it.title, it.cost?.toInt()?.toString()).joinToString(",") { value -> csv(value) }
        }
        return lines.joinToString("\n")
    }

    private fun buildPdf(report: FinanceReport): File {
        val dir = File(cacheDir, "reports").apply { mkdirs() }
        val file = File(dir, "rapport-finance.pdf")
        val pdf = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdf.startPage(pageInfo)
        val canvas = page.canvas
        val title = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 22f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val section = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11f }
        val muted = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 10f
            color = 0xFF64748B.toInt()
        }
        var y = 48f
        canvas.drawText("Rapport finance mobile", 40f, y, title)
        y += 24f
        canvas.drawText("Genere le ${LocalDate.now().format(DateTimeFormatter.ISO_DATE)}", 40f, y, muted)
        y += 34f

        listOf(
            "CA aujourd'hui: ${money(report.todayRevenue)}",
            "CA semaine: ${money(report.weekRevenue)}",
            "CA mois: ${money(report.monthRevenue)}",
            "CA total: ${money(report.totalRevenue)}",
            "Couts: ${money(report.totalCosts)}",
            "Marge nette: ${money(report.netProfit)}",
        ).forEach {
            canvas.drawText(it, 40f, y, text)
            y += 18f
        }

        y += 16f
        canvas.drawText("Top vehicules", 40f, y, section)
        y += 20f
        report.topVehicles.take(8).forEach {
            canvas.drawText("${it.label.take(28)} - ${money(it.amount)} (${it.count})", 40f, y, text)
            y += 16f
        }

        y += 14f
        canvas.drawText("Retours en retard", 40f, y, section)
        y += 20f
        val overdue = report.overdueReturns.take(8)
        if (overdue.isEmpty()) {
            canvas.drawText("Aucun retour en retard", 40f, y, muted)
        } else {
            overdue.forEach {
                canvas.drawText("${dateLabel(it.dateEnd)} - ${(it.vehicles?.plate ?: "-").take(12)} - ${(it.clients?.fullName ?: "-").take(24)}", 40f, y, text)
                y += 16f
            }
        }

        pdf.finishPage(page)
        file.outputStream().use { pdf.writeTo(it) }
        pdf.close()
        return file
    }

    private fun simpleText(text: String, muted: Boolean = false): TextView =
        TextView(this).apply {
            this.text = text
            setTextColor(ContextCompat.getColor(this@ReportsActivity, if (muted) R.color.muted else R.color.ink))
            textSize = 13f
            setPadding(0, 6, 0, 6)
        }

    private fun accumulate(map: MutableMap<String, RankRow>, key: String, label: String, amount: Double) {
        val current = map[key]
        if (current == null) {
            map[key] = RankRow(label, amount, 1)
        } else {
            map[key] = current.copy(amount = current.amount + amount, count = current.count + 1)
        }
    }

    private fun parseDate(value: String?): LocalDate? =
        value?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    private fun monthLabel(month: YearMonth): String =
        month.month.getDisplayName(TextStyle.SHORT, Locale.FRENCH).replace(".", "").take(3)

    private fun dateLabel(value: String?): String =
        parseDate(value)?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) ?: "-"

    private fun money(value: Double): String = "${value.toInt()} DH"

    private fun csv(value: String?): String = "\"${value.orEmpty().replace("\"", "\"\"")}\""

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private data class RankRow(
        val label: String,
        val amount: Double,
        val count: Int,
    )

    private data class FinanceReport(
        val todayRevenue: Double,
        val weekRevenue: Double,
        val monthRevenue: Double,
        val totalRevenue: Double,
        val serviceCosts: Double,
        val expenseCosts: Double,
        val issueCosts: Double,
        val totalCosts: Double,
        val netProfit: Double,
        val chart: List<Pair<String, Double>>,
        val topVehicles: List<RankRow>,
        val topClients: List<RankRow>,
        val upcomingReturns: List<Reservation>,
        val overdueReturns: List<Reservation>,
    )

    companion object {
        private val ignoredRevenueStatuses = setOf("cancelled", "blocked", "pending")
    }
}
