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
  contract_created: formatContract,
  vehicle_added: formatVehicle,
  contract_pdf_ready: formatPdfReady,
}

export function formatNotification(type, payload) {
  const fn = formatters[type]
  return fn ? fn(payload) : `📢 Notification: ${type}\n${JSON.stringify(payload, null, 2)}`
}
