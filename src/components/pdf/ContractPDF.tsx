import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
// Side-effect import (font registration) MUST come before StyleSheet.create below.
import { pdfFont } from './fonts'

export type ContractPdfData = {
  agency: {
    name: string
    city: string | null
    logo_url?: string | null
    stamp_url?: string | null
    // Optional legal identifiers (Moroccan RC/ICE/etc). Rendered when present.
    legal_name?: string | null
    address?: string | null
    ice?: string | null
    rib?: string | null
    rc?: string | null
    patente?: string | null
    phone?: string | null
  }
  contract: {
    short_id: string
    mileage_out: number | null
    mileage_in: number | null
    fuel_out: string | null
    fuel_in: string | null
    check_number: string | null
    check_bank: string | null
    check_amount: number | null
    extras: { name: string; price: number }[]
  }
  reservation: {
    date_start: string
    date_end: string
    total_amount: number | null
    daily_rate_snap: number | null
    pickup_location: string | null
    dropoff_location: string | null
  }
  vehicle: { plate: string; brand: string | null; model: string | null; year: number | null }
  client: {
    full_name: string
    cin_passport: string | null
    phone: string | null
    address: string | null
    nationality: string | null
  }
  // Free-form printed-contract fields edited on the contract page. Any missing
  // key renders as a blank fillable slot.
  form?: Record<string, string | undefined>
  // Online e-signature (data URL) + who signed and when.
  signature?: string | null
  signer_name?: string | null
  signed_at?: string | null
}

// ── Palette (navy Moroccan contract look) ─────────────────────────────
const NAVY = '#1e3a5f'
const NAVY_SOFT = '#2c4a70'
const INK = '#152238'
const MUTED = '#5b6b82'
const LINE = '#c3d0e0'
const BOX_BG = '#f4f7fb'
const ACCENT = '#e8eef6'

const s = StyleSheet.create({
  page: { paddingVertical: 22, paddingHorizontal: 24, fontSize: 8.5, color: INK, fontFamily: pdfFont.regular },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  logo: { height: 52, maxWidth: 190, objectFit: 'contain', marginBottom: 3 },
  brand: { fontSize: 22, fontFamily: pdfFont.bold, color: NAVY },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 1 },
  legal: { width: 220, textAlign: 'right' },
  legalName: { fontSize: 9, fontFamily: pdfFont.bold, color: INK },
  legalLine: { fontSize: 7, color: MUTED, marginTop: 1 },

  // Title bar
  titleBar: {
    backgroundColor: NAVY,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleText: { color: '#fff', fontSize: 13, fontFamily: pdfFont.bold },
  titleNum: {
    color: NAVY,
    fontSize: 9,
    fontFamily: pdfFont.bold,
    backgroundColor: '#fff',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 2,
  },

  // Columns
  body: { flexDirection: 'row', gap: 8 },
  colLeft: { width: '61%', gap: 8 },
  colRight: { width: '39%', gap: 8 },

  // Section box
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  boxHead: {
    backgroundColor: NAVY,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 8,
  },
  boxHeadText: { color: '#fff', fontSize: 8.5, fontFamily: pdfFont.bold },
  boxHeadAr: { color: '#dbe6f4', fontSize: 8.5, fontFamily: pdfFont.bold },
  boxBody: { padding: 7 },

  // Field grid
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', paddingHorizontal: 3, marginBottom: 6 },
  fieldFull: { width: '100%', paddingHorizontal: 3, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1.5 },
  labelFr: { fontSize: 6.5, color: NAVY, fontFamily: pdfFont.bold },
  labelAr: { fontSize: 6.5, color: MUTED },
  valueBox: {
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: BOX_BG,
    borderRadius: 2,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    minHeight: 14,
  },
  value: { fontSize: 9, color: INK, fontFamily: pdfFont.bold },

  // Réglement highlighted rows
  regRow: { marginBottom: 6 },
  totalBox: {
    marginTop: 2,
    backgroundColor: NAVY,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  totalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 2 },
  totalLabel: { color: '#dbe6f4', fontSize: 7.5, fontFamily: pdfFont.bold },
  totalValue: { color: '#fff', fontSize: 15, fontFamily: pdfFont.bold },

  // Fuel gauge
  gauge: { flexDirection: 'row', borderWidth: 1, borderColor: NAVY, borderRadius: 2, overflow: 'hidden', height: 16 },
  gaugeCell: { flex: 1, borderRightWidth: 1, borderRightColor: NAVY },
  gaugeCellLast: { flex: 1 },
  gaugeFilled: { backgroundColor: NAVY_SOFT },
  gaugeTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  gaugeTick: { fontSize: 6.5, color: MUTED },

  // Signatures
  signRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  signBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden', minHeight: 96 },
  signLegal: { fontSize: 6, color: MUTED, padding: 5, lineHeight: 1.3 },
  signArea: { flex: 1 },
  signNom: { fontSize: 6.5, color: MUTED, paddingHorizontal: 5, paddingTop: 4 },
  sigImg: { flex: 1, margin: 4, objectFit: 'contain' },
  sigMeta: { fontSize: 5.5, color: MUTED, paddingHorizontal: 5, paddingBottom: 3 },
  stampWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  stamp: { maxHeight: 74, maxWidth: '90%', objectFit: 'contain' },

  // Date-place line
  faitLine: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  faitLabel: { fontSize: 8, color: INK, fontFamily: pdfFont.bold },
  faitValue: {
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: BOX_BG,
    borderRadius: 2,
    paddingVertical: 2.5,
    paddingHorizontal: 10,
    fontSize: 9,
    fontFamily: pdfFont.bold,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: MUTED, textAlign: 'center', lineHeight: 1.3 },
  pageNum: { textAlign: 'center', fontSize: 6.5, color: NAVY, fontFamily: pdfFont.bold, marginTop: 2 },
})

const FUEL_LEVEL: Record<string, number> = {
  empty: 0,
  quarter: 1,
  half: 2,
  three_quarters: 3,
  full: 4,
}

function days(a: string, b: string) {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR')
}
function money(n: number | null | undefined) {
  return `${(n ?? 0).toLocaleString('fr-FR')} DH`
}

// One bilingual form field: FR + AR labels, boxed value (blank = fillable).
function F({ fr, ar, value, full }: { fr: string; ar: string; value?: string | null; full?: boolean }) {
  return (
    <View style={full ? s.fieldFull : s.field}>
      <View style={s.labelRow}>
        <Text style={s.labelFr}>{fr}</Text>
        <Text style={s.labelAr}>{ar}</Text>
      </View>
      <View style={s.valueBox}>
        <Text style={s.value}>{value || ' '}</Text>
      </View>
    </View>
  )
}

function SectionHead({ fr, ar }: { fr: string; ar: string }) {
  return (
    <View style={s.boxHead}>
      <Text style={s.boxHeadText}>{fr}</Text>
      <Text style={s.boxHeadAr}>{ar}</Text>
    </View>
  )
}

function FuelGauge({ level }: { level: number }) {
  return (
    <View>
      <View style={s.gauge}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              i === 3 ? s.gaugeCellLast : s.gaugeCell,
              i < level ? s.gaugeFilled : {},
            ]}
          />
        ))}
      </View>
      <View style={s.gaugeTicks}>
        <Text style={s.gaugeTick}>0</Text>
        <Text style={s.gaugeTick}>1/4</Text>
        <Text style={s.gaugeTick}>1/2</Text>
        <Text style={s.gaugeTick}>3/4</Text>
        <Text style={s.gaugeTick}>1</Text>
      </View>
    </View>
  )
}

// Moroccan bilingual (FR/AR) rental contract — replica of the standard printed form.
export function ContractPDF({ data }: { data: ContractPdfData }) {
  const { agency, contract, reservation, vehicle, client } = data
  const f = data.form ?? {}
  const nDays = days(reservation.date_start, reservation.date_end)
  const legalName = agency.legal_name || agency.name

  // Company legal footer/header line (only the parts we actually have).
  const legalBits = [
    agency.ice ? `ICE: ${agency.ice}` : null,
    agency.rc ? `RC: ${agency.rc}` : null,
    agency.patente ? `Patente: ${agency.patente}` : null,
    agency.rib ? `RIB: ${agency.rib}` : null,
    agency.phone ? `GSM: ${agency.phone}` : null,
  ].filter(Boolean)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header: brand + company legal block */}
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {agency.logo_url ? <Image src={agency.logo_url} style={s.logo} /> : null}
            {!agency.logo_url ? <Text style={s.brand}>{agency.name}</Text> : null}
            <Text style={s.brandSub}>Pour Location De Voiture</Text>
          </View>
          <View style={s.legal}>
            <Text style={s.legalName}>{legalName}</Text>
            {agency.address ? <Text style={s.legalLine}>{agency.address}</Text> : null}
            {agency.city ? <Text style={s.legalLine}>{agency.city}, Maroc</Text> : null}
            {legalBits.map((b, i) => (
              <Text key={i} style={s.legalLine}>
                {b}
              </Text>
            ))}
          </View>
        </View>

        {/* Title bar */}
        <View style={s.titleBar}>
          <Text style={s.titleText}> </Text>
          <Text style={s.titleText}>Contrat de location — عقد الكراء</Text>
          <Text style={s.titleNum}>{contract.short_id}</Text>
        </View>

        {/* Two columns */}
        <View style={s.body}>
          {/* LEFT */}
          <View style={s.colLeft}>
            <View style={s.box}>
              <SectionHead fr="Informations client" ar="معلومات الزبون" />
              <View style={s.boxBody}>
                <View style={s.grid}>
                  <F fr="Cin Client" ar="رقم البطاقة الوطنية" value={client.cin_passport} />
                  <F fr="Expiration Cin" ar="صالحة إلى غاية" value={f.client_cin_expiry} />
                  <F fr="Nom Client" ar="الإسم العائلي" value={f.client_nom || client.full_name} />
                  <F fr="Prénom Client" ar="الإسم الشخصي" value={f.client_prenom} />
                  <F fr="Date De Naissance" ar="تاريخ الإزدياد" value={f.client_birthdate} />
                  <F fr="Profession" ar="المهنة" value={f.client_profession} />
                  <F fr="Num Pérmis" ar="رقم رخصة السياقة" value={f.client_permit_number} />
                  <F fr="Date de Permis" ar="تاريخ رخصة السياقة" value={f.client_permit_date} />
                  <F fr="Lieu délivrance Permis" ar="مسلمة بـ" value={f.client_permit_place} />
                  <F fr="Téléphone 1" ar="الهاتف" value={client.phone} />
                  <F fr="Adresse" ar="العنوان" value={client.address} />
                  <F fr="Téléphone 2" ar="الهاتف" value={f.client_phone2} />
                  <F fr="Ville" ar="المدينة" value={f.client_ville} />
                  <F fr="Nationalité" ar="الجنسية" value={client.nationality} />
                </View>
              </View>
            </View>

            <View style={s.box}>
              <SectionHead fr="Informations 2ème conducteur" ar="السائق الثاني" />
              <View style={s.boxBody}>
                <View style={s.grid}>
                  <F fr="Cin 2ème conducteur" ar="رقم البطاقة" value={f.d2_cin} />
                  <F fr="Date d'Expiration Cin" ar="صالحة إلى غاية" value={f.d2_cin_expiry} />
                  <F fr="Nom 2ème conducteur" ar="الإسم العائلي" value={f.d2_nom} />
                  <F fr="Prénom 2ème" ar="الإسم الشخصي" value={f.d2_prenom} />
                  <F fr="Date De Naissance" ar="تاريخ الإزدياد" value={f.d2_birthdate} />
                  <F fr="Profession" ar="المهنة" value={f.d2_profession} />
                  <F fr="Num Pérmis" ar="رقم رخصة السياقة" value={f.d2_permit_number} />
                  <F fr="Date de Permis" ar="تاريخ رخصة السياقة" value={f.d2_permit_date} />
                  <F fr="Lieu délivrance Permis" ar="مسلمة بـ" value={f.d2_permit_place} />
                  <F fr="Téléphone" ar="الهاتف" value={f.d2_phone} />
                  <F fr="Adresse" ar="العنوان" value={f.d2_address} />
                  <F fr="Ville" ar="المدينة" value={f.d2_ville} />
                </View>
              </View>
            </View>
          </View>

          {/* RIGHT */}
          <View style={s.colRight}>
            <View style={s.box}>
              <SectionHead fr="Info. voiture" ar="معلومات السيارة" />
              <View style={s.boxBody}>
                <View style={s.grid}>
                  <F fr="Matricule" ar="رقم اللوحة" value={vehicle.plate} />
                  <F fr="Marque" ar="المُصنع" value={vehicle.brand} />
                  <F fr="Type" ar="النوع" value={vehicle.model} />
                  <F fr="Année" ar="السنة" value={vehicle.year ? String(vehicle.year) : ''} />
                </View>
              </View>
            </View>

            <View style={s.box}>
              <SectionHead fr="Carburant (départ)" ar="الوقود" />
              <View style={s.boxBody}>
                <FuelGauge level={contract.fuel_out ? FUEL_LEVEL[contract.fuel_out] ?? 0 : 0} />
              </View>
            </View>

            <View style={s.box}>
              <SectionHead fr="Réglement" ar="الأداء" />
              <View style={s.boxBody}>
                <View style={s.grid}>
                  <F fr="Durée" ar="المدة" value={`${nDays} Jour${nDays > 1 ? 's' : ''}`} />
                  <F fr="Prix par jour" ar="الثمن اليومي" value={money(reservation.daily_rate_snap)} />
                  <F fr="Date départ" ar="تاريخ الإنطلاق" value={fmtDate(reservation.date_start)} />
                  <F fr="Heure départ" ar="ساعة الإنطلاق" value={f.heure_depart} />
                  <F fr="Date retour" ar="تاريخ الرجوع" value={fmtDate(reservation.date_end)} />
                  <F fr="Heure retour" ar="ساعة الرجوع" value={f.heure_retour} />
                </View>
                <View style={s.totalBox}>
                  <View style={s.totalLabelRow}>
                    <Text style={s.totalLabel}>Totale à payer</Text>
                    <Text style={s.totalLabel}>المبلغ الإجمالي</Text>
                  </View>
                  <Text style={s.totalValue}>{money(reservation.total_amount)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Fait à … le … */}
        <View style={s.faitLine}>
          <Text style={s.faitLabel}>Fait à {agency.city || '__________'} le :</Text>
          <Text style={s.faitValue}>{fmtDate(reservation.date_start)}</Text>
        </View>

        {/* Signatures */}
        <View style={s.signRow}>
          <View style={s.signBox}>
            <SectionHead fr="Signature du client" ar="إمضاء الزبون" />
            <Text style={s.signLegal}>
              Je reconnais avoir pris connaissance des informations du présent contrat et j'accepte
              l'ensemble de ses conditions.{'\n'}
              اعترف باني قرأت المعلومات الواردة في هذا العقد، وأوافق على جميع ما جاء فيها.
            </Text>
            {data.signature ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={data.signature} style={s.sigImg} />
                <Text style={s.sigMeta}>
                  Signé en ligne{data.signer_name ? ` par ${data.signer_name}` : ''}
                  {data.signed_at ? ` · ${new Date(data.signed_at).toLocaleString('fr-FR')}` : ''}
                </Text>
              </>
            ) : (
              <View style={s.signArea} />
            )}
          </View>

          <View style={s.signBox}>
            <SectionHead fr="Signature 2ème conduc." ar="إمضاء السائق الثاني" />
            <Text style={s.signNom}>Nom complet : ........................................</Text>
            <View style={s.signArea} />
          </View>

          <View style={s.signBox}>
            <SectionHead fr="Cachet de l'agence" ar="طابع الشركة" />
            {agency.stamp_url ? (
              <View style={s.stampWrap}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={agency.stamp_url} style={s.stamp} />
              </View>
            ) : (
              <View style={s.signArea} />
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {legalName}
            {agency.address ? ` — ${agency.address}` : ''}
            {legalBits.length ? `\n${legalBits.join('  |  ')}` : ''}
          </Text>
          <Text
            style={s.pageNum}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
