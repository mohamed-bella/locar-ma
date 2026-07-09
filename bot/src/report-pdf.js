import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { supabase } from './supabase.js'
import { R2_PUBLIC_URL } from './config.js'
import { casablancaToday } from './report.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const e = React.createElement

// Fonts — Tajawal (Latin + Arabic, shaped by fontkit)
const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' }
try {
  const dir = join(__dirname, '..', 'fonts')
  const reg = join(dir, 'Tajawal-Regular.ttf')
  const bold = join(dir, 'Tajawal-Bold.ttf')
  if (existsSync(reg) && existsSync(bold)) {
    Font.register({ family: 'Tajawal', src: reg })
    Font.register({ family: 'Tajawal-Bold', src: bold })
    Font.registerHyphenationCallback((w) => [w])
    FONT.regular = 'Tajawal'
    FONT.bold = 'Tajawal-Bold'
  }
} catch {
  /* keep Helvetica */
}

// ── Formal enterprise-report palette (monochrome + conditional red/amber) ──
const INK = '#1a1a1a'
const GRID = '#666666' // gridlines
const GRID_D = '#1a1a1a' // heavy rules
const HEAD = '#d9d9d9' // gray header-row fill
const BAR = '#1f3a5f' // dark navy section bar
const MUTE = '#555555'
const RED = '#8b0000'
const AMBER = '#8a6a00'

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 34, fontSize: 9.5, color: INK, fontFamily: FONT.regular, backgroundColor: '#ffffff' },

  // Letterhead
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headLogo: { maxHeight: 44, maxWidth: 150, objectFit: 'contain', marginBottom: 3 },
  headName: { fontSize: 13, fontFamily: FONT.bold, color: INK },
  headCity: { fontSize: 9, color: MUTE, marginTop: 1 },
  headTitle: { fontSize: 15, fontFamily: FONT.bold, color: INK, textAlign: 'right', letterSpacing: 1 },
  headTitleAr: { fontSize: 12, color: MUTE, textAlign: 'right', marginTop: 1 },
  ruleThick: { borderBottomWidth: 2, borderBottomColor: GRID_D, marginTop: 6 },
  ruleThin: { borderBottomWidth: 0.5, borderBottomColor: GRID_D, marginTop: 1.5 },
  subline: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, marginBottom: 4 },
  subtext: { fontSize: 8.5, color: MUTE },

  // Section bar (dark navy, square, uppercase)
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BAR, paddingVertical: 3.5, paddingHorizontal: 7, marginTop: 15, marginBottom: 0 },
  secFr: { fontSize: 9.5, fontFamily: FONT.bold, color: '#ffffff', letterSpacing: 1 },
  secAr: { fontSize: 9.5, color: '#cdd8e6' },

  // Tables — fully gridded, square
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: GRID },
  tr: { flexDirection: 'row' },
  cellBase: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID, paddingVertical: 3.5, paddingHorizontal: 5 },
  th: { backgroundColor: HEAD, fontFamily: FONT.bold, fontSize: 8.5, color: INK },
  td: { fontSize: 9 },

  // Summary two-column list
  sumTable: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: GRID, width: '60%' },
  sumLabel: { flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID, paddingVertical: 4, paddingHorizontal: 6, fontSize: 9.5 },
  sumVal: { width: 90, borderRightWidth: 1, borderBottomWidth: 1, borderColor: GRID, paddingVertical: 4, paddingHorizontal: 6, fontSize: 9.5, fontFamily: FONT.bold, textAlign: 'right' },

  // Vehicle block
  vblock: { borderWidth: 1, borderColor: GRID_D, marginBottom: 11 },
  vhead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRID_D, padding: 7, gap: 9 },
  vimg: { width: 104, height: 74, objectFit: 'cover', borderWidth: 1, borderColor: GRID },
  vimgPh: { width: 104, height: 74, borderWidth: 1, borderColor: GRID, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  vname: { fontSize: 13, fontFamily: FONT.bold, color: INK },
  vsub: { fontSize: 9, color: MUTE, marginTop: 1 },
  vstatus: { fontSize: 9, fontFamily: FONT.bold, marginTop: 4 },
  vmeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  vmetaCell: { width: '25%', marginBottom: 2 },
  vmetaLbl: { fontSize: 7.5, color: MUTE, textTransform: 'uppercase' },
  vmetaVal: { fontSize: 10, fontFamily: FONT.bold },
  vbody: { padding: 7 },
  subhead: { fontSize: 8.5, fontFamily: FONT.bold, color: INK, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, marginTop: 4 },

  footer: { position: 'absolute', bottom: 20, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: GRID_D, paddingTop: 4 },
  footerT: { fontSize: 7.5, color: MUTE },
})

const STATUS = { available: 'Disponible', rented: 'En location', maintenance: 'Maintenance', reserved: 'Réservé' }
const STATUS_C = { available: INK, rented: RED, maintenance: AMBER, reserved: INK }
const RES_STATUS = { pending: 'En attente', confirmed: 'Confirmée', active: 'Active', closed: 'Terminée', cancelled: 'Annulée', blocked: 'Bloqué' }

function fdate(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR')
}
function money(n) {
  return `${Number(n ?? 0).toLocaleString('fr-FR')} DH`
}
function daysUntil(d, today) {
  if (!d) return null
  return Math.round((new Date(`${d}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
}
function expiryColor(d, today) {
  const n = daysUntil(d, today)
  if (n == null) return INK
  if (n < 0) return RED
  if (n <= 30) return AMBER
  return INK
}

async function fetchImage(key, maxW = 480) {
  if (!key || !R2_PUBLIC_URL) return null
  try {
    const url = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const raw = Buffer.from(await res.arrayBuffer())
    if (!raw.length) return null
    const jpeg = await sharp(raw).rotate().resize({ width: maxW, withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

// gridded cell
function Cell(w, children, extra) {
  return e(View, { style: [s.cellBase, { width: w }] }, e(Text, { style: extra }, children))
}
function sec(fr, ar, key) {
  return e(View, { style: s.sec, key }, [e(Text, { key: 'f', style: s.secFr }, fr), e(Text, { key: 'a', style: s.secAr }, ar)])
}
function letterhead(agencyName, city, logo) {
  return e(View, { key: 'lh' }, [
    e(View, { style: s.head, key: 'row' }, [
      e(View, { key: 'l' }, [
        logo ? e(Image, { src: logo, style: s.headLogo, key: 'img' }) : null,
        e(Text, { style: s.headName, key: 'n' }, agencyName),
        city ? e(Text, { style: s.headCity, key: 'c' }, city) : null,
      ]),
      e(View, { key: 'r' }, [
        e(Text, { style: s.headTitle, key: 't' }, 'RAPPORT DE FLOTTE'),
        e(Text, { style: s.headTitleAr, key: 'ta' }, 'تقرير الأسطول'),
      ]),
    ]),
    e(View, { style: s.ruleThick, key: 'rk' }),
    e(View, { style: s.ruleThin, key: 'rt' }),
  ])
}
function footer(agencyName, today) {
  return e(View, { style: s.footer, fixed: true }, [
    e(Text, { style: s.footerT, key: 'l' }, `${agencyName}  —  Généré le ${fdate(today)}`),
    e(Text, { style: s.footerT, key: 'r', render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` }),
  ])
}
function subline(left, right) {
  return e(View, { style: s.subline, key: 'sl' }, [
    e(Text, { style: s.subtext, key: 'l' }, left),
    e(Text, { style: s.subtext, key: 'r' }, right),
  ])
}

export async function buildFleetReportPdf(agencyId) {
  const today = casablancaToday()
  const mo = today.slice(0, 7)
  const dateLong = new Date(`${today}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const [{ data: agency }, { data: vehicles }, { data: reservations }, { data: contracts }, { data: services }] =
    await Promise.all([
      supabase.from('agencies').select('name, city, logo_url').eq('id', agencyId).maybeSingle(),
      supabase
        .from('vehicles')
        .select('id, plate, brand, model, year, category, daily_rate, status, mileage_current, insurance_expiry, vignette_expiry, visite_tech_expiry, image_keys, notes')
        .eq('agency_id', agencyId)
        .order('plate'),
      supabase
        .from('reservations')
        .select('vehicle_id, date_start, date_end, status, total_amount, clients(full_name), vehicles(plate)')
        .eq('agency_id', agencyId)
        .neq('status', 'blocked')
        .order('date_start', { ascending: false }),
      supabase.from('contracts').select('id, closed_at').eq('agency_id', agencyId),
      supabase.from('service_records').select('vehicle_id, type, performed_at, odometer_km').eq('agency_id', agencyId).order('performed_at', { ascending: false }),
    ])

  const vs = vehicles ?? []
  const rs = reservations ?? []
  const cs = contracts ?? []
  const sv = services ?? []
  const agencyName = agency?.name ?? 'Agence'

  const resByVehicle = new Map()
  for (const r of rs) {
    const list = resByVehicle.get(r.vehicle_id) ?? []
    list.push(r)
    resByVehicle.set(r.vehicle_id, list)
  }
  const svByVehicle = new Map()
  for (const x of sv) if (!svByVehicle.has(x.vehicle_id)) svByVehicle.set(x.vehicle_id, x)

  const byStatus = (st) => vs.filter((v) => v.status === st).length
  const active = rs.filter((r) => r.date_start <= today && r.date_end >= today && r.status !== 'cancelled').length
  const openContracts = cs.filter((c) => !c.closed_at).length
  const revMonth = rs.filter((r) => r.status !== 'pending' && r.status !== 'cancelled' && String(r.date_start).slice(0, 7) === mo).reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
  const revTotal = rs.filter((r) => r.status !== 'pending' && r.status !== 'cancelled').reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)

  const [logo, ...vehImages] = await Promise.all([
    fetchImage(agency?.logo_url ? agency.logo_url.replace(`${R2_PUBLIC_URL.replace(/\/$/, '')}/`, '') : null, 300),
    ...vs.map((v) => fetchImage((v.image_keys ?? [])[0], 300)),
  ])
  const imgByVehicle = new Map(vs.map((v, i) => [v.id, vehImages[i]]))

  // Summary rows
  const sumRow = (fr, ar, val, k) =>
    e(View, { style: s.tr, key: k }, [
      e(Text, { style: s.sumLabel, key: 'l' }, `${fr}  ·  ${ar}`),
      e(Text, { style: s.sumVal, key: 'v' }, String(val)),
    ])

  // Fleet table
  const fc = ['13%', '25%', '14%', '11%', '12.33%', '12.33%', '12.33%']
  const fleetHeader = e(View, { style: s.tr, key: 'fh' }, [
    Cell(fc[0], 'MATRICULE', s.th), Cell(fc[1], 'MARQUE / MODÈLE', s.th), Cell(fc[2], 'STATUT', s.th), Cell(fc[3], 'KM', s.th),
    Cell(fc[4], 'ASSURANCE', s.th), Cell(fc[5], 'VIGNETTE', s.th), Cell(fc[6], 'V.TECH', s.th),
  ])
  const fleetRows = vs.map((v, i) =>
    e(View, { style: s.tr, key: i, wrap: false }, [
      Cell(fc[0], v.plate ?? '—', s.td),
      Cell(fc[1], [v.brand, v.model].filter(Boolean).join(' ') || '—', s.td),
      Cell(fc[2], STATUS[v.status] ?? v.status ?? '—', [s.td, { color: STATUS_C[v.status] ?? INK, fontFamily: FONT.bold }]),
      Cell(fc[3], v.mileage_current != null ? String(v.mileage_current) : '—', s.td),
      Cell(fc[4], fdate(v.insurance_expiry), [s.td, { color: expiryColor(v.insurance_expiry, today) }]),
      Cell(fc[5], fdate(v.vignette_expiry), [s.td, { color: expiryColor(v.vignette_expiry, today) }]),
      Cell(fc[6], fdate(v.visite_tech_expiry), [s.td, { color: expiryColor(v.visite_tech_expiry, today) }]),
    ]),
  )

  const summaryPage = e(Page, { size: 'A4', style: s.page, key: 'sum' }, [
    letterhead(agencyName, agency?.city, logo),
    subline(`Date du rapport : ${dateLong}`, `${vs.length} véhicule(s) · ${rs.length} réservation(s)`),
    sec('SYNTHÈSE', 'ملخص', 'ss'),
    e(View, { style: s.sumTable, key: 'sum' }, [
      sumRow('Total voitures', 'مجموع السيارات', vs.length, 'r1'),
      sumRow('Disponibles', 'متوفرة', byStatus('available'), 'r2'),
      sumRow('En location', 'مؤجرة', byStatus('rented'), 'r3'),
      sumRow('En maintenance', 'صيانة', byStatus('maintenance'), 'r4'),
      sumRow('Réservations actives', 'حجوزات نشطة', active, 'r5'),
      sumRow('Contrats ouverts', 'عقود مفتوحة', openContracts, 'r6'),
      sumRow('Réservations totales', 'مجموع الحجوزات', rs.length, 'r7'),
      sumRow('Chiffre d’affaires du mois', 'مداخيل الشهر', money(revMonth), 'r8'),
      sumRow('Chiffre d’affaires total', 'المداخيل الكلية', money(revTotal), 'r9'),
    ]),
    sec('VUE D’ENSEMBLE DE LA FLOTTE', 'نظرة عامة على الأسطول', 'sf'),
    e(View, { style: s.table, key: 'fleet' }, [fleetHeader, ...fleetRows]),
    footer(agencyName, today),
  ])

  // Per-vehicle
  const vehicleBlock = (v, i) => {
    const img = imgByVehicle.get(v.id)
    const vres = resByVehicle.get(v.id) ?? []
    const vrev = vres.filter((r) => r.status !== 'cancelled' && r.status !== 'pending').reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
    const lastSv = svByVehicle.get(v.id)

    const dc = ['46%', '27%', '27%']
    const docHead = e(View, { style: s.tr, key: 'dh' }, [Cell(dc[0], 'DOCUMENT', s.th), Cell(dc[1], 'ÉCHÉANCE', s.th), Cell(dc[2], 'STATUT', s.th)])
    const docRow = (label, ar, date, k) =>
      e(View, { style: s.tr, key: k, wrap: false }, [
        Cell(dc[0], `${label} · ${ar}`, s.td),
        Cell(dc[1], fdate(date), [s.td, { color: expiryColor(date, today), fontFamily: FONT.bold }]),
        Cell(dc[2], (() => { const n = daysUntil(date, today); return n == null ? '—' : n < 0 ? `Expiré (${-n} j)` : `${n} j restants` })(), [s.td, { color: expiryColor(date, today) }]),
      ])

    const rcv = ['25%', '25%', '28%', '22%']
    const resHead = e(View, { style: s.tr, key: 'rh' }, [Cell(rcv[0], 'DU', s.th), Cell(rcv[1], 'AU', s.th), Cell(rcv[2], 'CLIENT', s.th), Cell(rcv[3], 'MONTANT', s.th)])
    const resRows = vres.slice(0, 5).map((r, j) =>
      e(View, { style: s.tr, key: j, wrap: false }, [
        Cell(rcv[0], fdate(r.date_start), s.td), Cell(rcv[1], fdate(r.date_end), s.td),
        Cell(rcv[2], r.clients?.full_name ?? '—', s.td), Cell(rcv[3], money(r.total_amount), s.td),
      ]),
    )

    const meta = (lbl, val, k) => e(View, { style: s.vmetaCell, key: k }, [e(Text, { style: s.vmetaLbl, key: 'l' }, lbl), e(Text, { style: s.vmetaVal, key: 'v' }, val)])

    return e(View, { style: s.vblock, key: i, wrap: false }, [
      e(View, { style: s.vhead, key: 'head' }, [
        img ? e(Image, { src: img, style: s.vimg, key: 'img' }) : e(View, { style: s.vimgPh, key: 'ph' }, e(Text, { style: { fontSize: 8, color: MUTE } }, 'Sans photo')),
        e(View, { style: { flex: 1 }, key: 'info' }, [
          e(Text, { style: s.vname, key: 'a' }, [v.brand, v.model].filter(Boolean).join(' ') || v.plate),
          e(Text, { style: s.vsub, key: 'b' }, `${v.plate}${v.year ? ` · ${v.year}` : ''}${v.category ? ` · ${v.category}` : ''}`),
          e(Text, { style: [s.vstatus, { color: STATUS_C[v.status] ?? INK }], key: 'st' }, (STATUS[v.status] ?? v.status ?? '—').toUpperCase()),
          e(View, { style: s.vmeta, key: 'meta' }, [
            meta('Tarif / jour', money(v.daily_rate), 'm1'),
            meta('Kilométrage', v.mileage_current != null ? `${v.mileage_current} km` : '—', 'm2'),
            meta('Réservations', String(vres.length), 'm3'),
            meta('CA généré', money(vrev), 'm4'),
          ]),
        ]),
      ]),
      e(View, { style: s.vbody, key: 'body' }, [
        e(Text, { style: s.subhead, key: 's1' }, 'Suivi des documents · متابعة الوثائق'),
        e(View, { style: s.table, key: 'docs' }, [docHead, docRow('Assurance', 'التأمين', v.insurance_expiry, 'd1'), docRow('Vignette', 'الفينيات', v.vignette_expiry, 'd2'), docRow('Visite technique', 'الفحص التقني', v.visite_tech_expiry, 'd3')]),
        lastSv ? e(Text, { style: { fontSize: 9, color: INK, marginTop: 4 }, key: 'sv' }, `Dernier entretien : ${lastSv.type ?? '—'} le ${fdate(lastSv.performed_at)}${lastSv.odometer_km ? ` à ${lastSv.odometer_km} km` : ''}`) : null,
        vres.length ? e(Text, { style: s.subhead, key: 's2' }, 'Réservations récentes · الحجوزات الأخيرة') : null,
        vres.length ? e(View, { style: s.table, key: 'res' }, [resHead, ...resRows]) : null,
        v.notes ? e(Text, { style: { fontSize: 9, color: MUTE, marginTop: 3 }, key: 'notes' }, `Notes : ${v.notes}`) : null,
      ]),
    ])
  }

  const vehiclePages = e(Page, { size: 'A4', style: s.page, key: 'veh' }, [
    letterhead(agencyName, agency?.city, logo),
    sec('DÉTAIL DES VÉHICULES', 'تفاصيل السيارات', 'sv'),
    ...vs.map((v, i) => vehicleBlock(v, i)),
    vs.length === 0 ? e(Text, { style: { fontSize: 10, color: MUTE, marginTop: 8 }, key: 'none' }, 'Aucun véhicule.') : null,
    footer(agencyName, today),
  ])

  // All reservations
  const rc = ['15%', '15%', '20%', '22%', '14%', '14%']
  const rHead = e(View, { style: s.tr, key: 'rh' }, [
    Cell(rc[0], 'DU', s.th), Cell(rc[1], 'AU', s.th), Cell(rc[2], 'VOITURE', s.th), Cell(rc[3], 'CLIENT', s.th), Cell(rc[4], 'STATUT', s.th), Cell(rc[5], 'MONTANT', s.th),
  ])
  const rRows = rs.map((r, i) =>
    e(View, { style: s.tr, key: i, wrap: false }, [
      Cell(rc[0], fdate(r.date_start), s.td), Cell(rc[1], fdate(r.date_end), s.td), Cell(rc[2], r.vehicles?.plate ?? '—', s.td),
      Cell(rc[3], r.clients?.full_name ?? '—', s.td), Cell(rc[4], RES_STATUS[r.status] ?? r.status, s.td), Cell(rc[5], money(r.total_amount), s.td),
    ]),
  )
  const reservationsPage = e(Page, { size: 'A4', style: s.page, key: 'res' }, [
    letterhead(agencyName, agency?.city, logo),
    sec('TOUTES LES RÉSERVATIONS', 'جميع الحجوزات', 'sr'),
    subline(`${rs.length} réservation(s)`, `Chiffre d’affaires total : ${money(revTotal)}`),
    e(View, { style: s.table, key: 't' }, [rHead, ...(rRows.length ? rRows : [e(Text, { style: { fontSize: 10, color: MUTE, padding: 8 }, key: 'n' }, 'Aucune réservation.')])]),
    footer(agencyName, today),
  ])

  return renderToBuffer(e(Document, null, [summaryPage, vehiclePages, reservationsPage]))
}
