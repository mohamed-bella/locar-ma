// Format notification payloads into WhatsApp-friendly text messages.

function fdate(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00`)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function money(n) {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('fr-FR')} MAD`
}

function prettyType(type) {
  switch (type) {
    case 'vidange':
      return 'Vidange'
    case 'freins':
      return 'Freins'
    case 'pneus':
      return 'Pneus'
    case 'courroie':
      return 'Courroie'
    case 'filtre':
      return 'Filtre'
    case 'autre':
      return 'Autre'
    default:
      return type || '—'
  }
}

export function formatReservation(p) {
  return [
    `🚗 *Nouvelle Réservation*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Client: ${p.client || '—'}`,
    `▸ Du: ${fdate(p.date_start)}`,
    `▸ Au: ${fdate(p.date_end)}`,
    `▸ Montant: ${money(p.total_amount)}`,
    `▸ Statut: ${p.status || '—'}`,
  ].join('\n')
}

export function formatReservationCancelled(p) {
  return [
    `⚠️ *Réservation annulée*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Client: ${p.client || '—'}`,
    `▸ Du: ${fdate(p.date_start)}`,
    `▸ Au: ${fdate(p.date_end)}`,
  ].join('\n')
}

export function formatContract(p) {
  return [
    `📝 *Nouveau Contrat*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Client: ${p.client || '—'}`,
    `▸ Du: ${fdate(p.date_start)}`,
    `▸ Au: ${fdate(p.date_end)}`,
    `▸ Caution: ${money(p.check_amount)}`,
  ].join('\n')
}

export function formatContractSigned(p) {
  return [
    `✅ *Contrat signé*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Client: ${p.client || '—'}`,
    `▸ Début: ${fdate(p.date_start)}`,
    `▸ Fin: ${fdate(p.date_end)}`,
    `▸ Signé par: ${p.signed_by || '—'}`,
  ].join('\n')
}

export function formatContractClosed(p) {
  return [
    `*Contrat cloture*`,
    ``,
    `- Vehicule: ${p.vehicle || '---'} (${p.plate || '---'})`,
    `- Client: ${p.client || '---'}`,
    `- Km retour: ${p.mileage_in ?? '---'}`,
    `- Carburant retour: ${p.fuel_in || '---'}`,
  ].join('\n')
}

export function formatVehicle(p) {
  return [
    `🆕 *Nouveau Véhicule*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'}`,
    `▸ Immatriculation: ${p.plate || '—'}`,
    `▸ Année: ${p.year || '—'}`,
    `▸ Catégorie: ${p.category || '—'}`,
    `▸ Tarif/jour: ${money(p.daily_rate)}`,
  ].join('\n')
}

export function formatServiceRecordCreated(p) {
  return [
    `🔧 *Suivi enregistré*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Type: ${prettyType(p.type)}`,
    `▸ Date: ${fdate(p.performed_at)}`,
    `▸ Km: ${p.odometer_km ?? '—'}`,
    `▸ Coût: ${money(p.cost)}`,
  ].join('\n')
}

export function formatVehicleIssueCreated(p) {
  return [
    `*Probleme vehicule signale*`,
    ``,
    `- Vehicule: ${p.vehicle || '---'}`,
    `- Titre: ${p.title || '---'}`,
    `- Type: ${p.kind || '---'}`,
    `- Categorie: ${p.category || '---'}`,
    `- Severite: ${p.severity || '---'}`,
    `- Bloque location: ${p.blocks_rental ? 'Oui' : 'Non'}`,
    `- Date: ${fdate(p.opened_at)}`,
  ].join('\n')
}

export function formatPdfReady(p) {
  return [
    `📄 *Contrat PDF Prêt*`,
    ``,
    `▸ Véhicule: ${p.vehicle || '—'} (${p.plate || '—'})`,
    `▸ Client: ${p.client || '—'}`,
    ``,
    `Le contrat est joint ci-dessous. 👇`,
  ].join('\n')
}

const formatters = {
  reservation_created: formatReservation,
  reservation_cancelled: formatReservationCancelled,
  contract_created: formatContract,
  contract_signed: formatContractSigned,
  contract_closed: formatContractClosed,
  vehicle_added: formatVehicle,
  service_record_created: formatServiceRecordCreated,
  vehicle_issue_created: formatVehicleIssueCreated,
  contract_pdf_ready: formatPdfReady,
}

export function formatNotification(type, payload) {
  const fn = formatters[type]
  return fn ? fn(payload) : `📢 Notification: ${type}\n${JSON.stringify(payload, null, 2)}`
}
