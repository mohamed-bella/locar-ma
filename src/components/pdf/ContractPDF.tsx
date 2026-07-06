import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export type ContractPdfData = {
  agency: { name: string; city: string | null }
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
}

const ORANGE = '#fa5a28'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: INK, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  agency: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK },
  agencySub: { fontSize: 9, color: MUTED, marginTop: 2 },
  docTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: ORANGE, textAlign: 'right' },
  docMeta: { fontSize: 8, color: MUTED, textAlign: 'right', marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: ORANGE,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 5 },
  cellThird: { width: '33.33%', marginBottom: 5 },
  label: { fontSize: 7, color: MUTED, textTransform: 'uppercase' },
  value: { fontSize: 10, color: INK, marginTop: 1 },
  totalBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#fff1ec',
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 10, color: INK, fontFamily: 'Helvetica-Bold' },
  totalValue: { fontSize: 16, color: ORANGE, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  signBox: { width: '45%' },
  signLine: { borderTopWidth: 1, borderTopColor: INK, marginTop: 30, paddingTop: 4, fontSize: 8, color: MUTED },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: MUTED, textAlign: 'center' },
})

const FUEL_FR: Record<string, string> = {
  empty: 'Vide',
  quarter: '1/4',
  half: '1/2',
  three_quarters: '3/4',
  full: 'Plein',
}

function days(a: string, b: string) {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}
function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR')
}
function money(n: number | null | undefined) {
  return `${(n ?? 0).toLocaleString('fr-FR')} MAD`
}

function Field({ label, value, third }: { label: string; value: string; third?: boolean }) {
  return (
    <View style={third ? s.cellThird : s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '—'}</Text>
    </View>
  )
}

// Bilingual-ready rental contract (FR). AR font embedding is a follow-up.
export function ContractPDF({ data }: { data: ContractPdfData }) {
  const { agency, contract, reservation, vehicle, client } = data
  const nDays = days(reservation.date_start, reservation.date_end)
  const vehicleName = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.agency}>{agency.name}</Text>
            {agency.city ? <Text style={s.agencySub}>{agency.city}, Maroc</Text> : null}
          </View>
          <View>
            <Text style={s.docTitle}>CONTRAT DE LOCATION</Text>
            <Text style={s.docMeta}>N° {contract.short_id}</Text>
            <Text style={s.docMeta}>{new Date().toLocaleDateString('fr-FR')}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Locataire</Text>
          <View style={s.grid}>
            <Field label="Nom complet" value={client.full_name} />
            <Field label="CIN / Passeport" value={client.cin_passport ?? ''} />
            <Field label="Téléphone" value={client.phone ?? ''} />
            <Field label="Nationalité" value={client.nationality ?? ''} />
            <Field label="Adresse" value={client.address ?? ''} />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Véhicule</Text>
          <View style={s.grid}>
            <Field label="Immatriculation" value={vehicle.plate} third />
            <Field label="Marque / Modèle" value={vehicleName} third />
            <Field label="Année" value={vehicle.year ? String(vehicle.year) : ''} third />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Location</Text>
          <View style={s.grid}>
            <Field label="Du" value={fmtDate(reservation.date_start)} third />
            <Field label="Au" value={fmtDate(reservation.date_end)} third />
            <Field label="Durée" value={`${nDays} jour${nDays > 1 ? 's' : ''}`} third />
            <Field label="Lieu de départ" value={reservation.pickup_location ?? ''} third />
            <Field label="Lieu de retour" value={reservation.dropoff_location ?? ''} third />
            <Field label="Tarif / jour" value={money(reservation.daily_rate_snap)} third />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>État du véhicule</Text>
          <View style={s.grid}>
            <Field label="Km départ" value={contract.mileage_out != null ? String(contract.mileage_out) : ''} third />
            <Field label="Km retour" value={contract.mileage_in != null ? String(contract.mileage_in) : ''} third />
            <Field label="Carburant départ" value={contract.fuel_out ? FUEL_FR[contract.fuel_out] : ''} third />
            <Field label="Carburant retour" value={contract.fuel_in ? FUEL_FR[contract.fuel_in] : ''} third />
          </View>
        </View>

        {(contract.check_number || contract.check_amount) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Garantie (chèque)</Text>
            <View style={s.grid}>
              <Field label="N° chèque" value={contract.check_number ?? ''} third />
              <Field label="Banque" value={contract.check_bank ?? ''} third />
              <Field label="Montant" value={money(contract.check_amount)} third />
            </View>
          </View>
        )}

        {contract.extras.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Suppléments</Text>
            {contract.extras.map((x, i) => (
              <View key={i} style={s.row}>
                <Text>{x.name}</Text>
                <Text>{money(x.price)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.totalBox}>
          <Text style={s.totalLabel}>TOTAL</Text>
          <Text style={s.totalValue}>{money(reservation.total_amount)}</Text>
        </View>

        <View style={s.signRow}>
          <View style={s.signBox}>
            <Text style={s.signLine}>Signature du locataire</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signLine}>Signature de l'agence</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          {agency.name} — Contrat généré via Rentiq
        </Text>
      </Page>
    </Document>
  )
}
