import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'marketing-assets')
const imgDir = path.join(outDir, 'images')
const logoSrc = path.join(root, 'rentiq-logo.png')
const logoOut = path.join(outDir, 'rentiq-logo.png')

const colors = {
  navy: '#003B95',
  blue: '#0071C2',
  deep: '#071B3D',
  gray: '#E9EDF2',
  line: '#D3DAE3',
  ink: '#172033',
  muted: '#5F6B7A',
  green: '#008A45',
  red: '#D4112F',
  yellow: '#FFB700',
  white: '#FFFFFF',
}

const cards = [
  {
    id: '01-suite-complete',
    title: 'Rentiq, votre agence dans une seule interface',
    eyebrow: 'Mobile + Web + WhatsApp',
    body: 'Réservations, contrats, flotte, clients, suivi, paiements et alertes réunis pour piloter la location sans perdre le fil.',
    bullets: ['Vue opérationnelle en temps réel', 'Application Android pour le terrain', 'Web app pour la gestion complète'],
    accent: colors.blue,
    icon: 'dashboard',
  },
  {
    id: '02-mobile-terrain',
    title: 'Application mobile pour travailler vite',
    eyebrow: 'Android',
    body: 'Une interface compacte pour les propriétaires et agents: créer, vérifier, annuler, signer et suivre les voitures depuis le téléphone.',
    bullets: ['Accueil opérationnel', 'Voitures, réservations, suivi', 'Actions rapides et cartes lisibles'],
    accent: colors.navy,
    icon: 'phone',
  },
  {
    id: '03-web-dashboard',
    title: 'Tableau de bord web clair et complet',
    eyebrow: 'Web app',
    body: 'Un cockpit pour suivre la flotte, les départs, les retours, les contrats ouverts, les revenus et les points urgents.',
    bullets: ['Indicateurs de performance', 'Recherche et filtres', 'Navigation par module'],
    accent: colors.green,
    icon: 'chart',
  },
  {
    id: '04-reservations',
    title: 'Réservations organisées du début à la fin',
    eyebrow: 'Planning',
    body: 'Création rapide, disponibilité véhicule, dates, client, montant, statut et annulation archivée sans casser l’historique.',
    bullets: ['Planning et liste', 'Statuts actifs, confirmés, terminés', 'Annulation douce avec notification'],
    accent: colors.red,
    icon: 'calendar',
  },
  {
    id: '05-contrats',
    title: 'Contrats numériques et PDF prêts à envoyer',
    eyebrow: 'Contrats',
    body: 'Génération de contrat, aperçu PDF, partage, téléchargement et archivage pour garder chaque location propre.',
    bullets: ['PDF bilingue FR/AR', 'Aperçu avant envoi', 'Sauvegarde et partage'],
    accent: colors.deep,
    icon: 'contract',
  },
  {
    id: '06-signature-client',
    title: 'Signature client par lien sécurisé',
    eyebrow: 'Signature',
    body: 'Le client signe depuis son téléphone via un lien. L’agence reçoit l’information et le contrat reste traçable.',
    bullets: ['Lien ou QR code', 'Copier et partager', 'Notification contrat signé'],
    accent: colors.yellow,
    icon: 'signature',
  },
  {
    id: '07-flotte',
    title: 'Gestion complète de la flotte',
    eyebrow: 'Voitures',
    body: 'Chaque véhicule garde ses documents, photos, kilométrage, prix, statut, dépenses et historique de location.',
    bullets: ['Fiche véhicule détaillée', 'Photos et documents', 'Disponibilité claire'],
    accent: colors.blue,
    icon: 'car',
  },
  {
    id: '08-sante-vehicule',
    title: 'Santé véhicule et alertes de documents',
    eyebrow: 'Suivi',
    body: 'Assurance, vignette, visite technique, vidange, pneus, freins et autres échéances restent visibles avant le problème.',
    bullets: ['Dates d’expiration', 'Historique par véhicule', 'Statuts OK, bientôt, expiré'],
    accent: colors.green,
    icon: 'wrench',
  },
  {
    id: '09-maintenance',
    title: 'Maintenance rapide depuis le mobile',
    eyebrow: 'Vidange, pneus, freins',
    body: 'Ajouter une intervention, un kilométrage, un coût, une prochaine échéance et une note sans quitter la fiche voiture.',
    bullets: ['Ajout service rapide', 'Coûts et kilométrage', 'Historique récent'],
    accent: colors.navy,
    icon: 'tools',
  },
  {
    id: '10-clients',
    title: 'Base clients centralisée',
    eyebrow: 'CRM location',
    body: 'Retrouvez CIN, téléphone, permis, historique, contrats et réservations pour servir les clients plus vite.',
    bullets: ['Recherche client', 'Détails et historique', 'Création depuis mobile ou web'],
    accent: colors.red,
    icon: 'users',
  },
  {
    id: '11-notifications',
    title: 'Notifications WhatsApp automatiques',
    eyebrow: 'Bot WhatsApp',
    body: 'Le propriétaire reçoit les événements importants: nouvelle réservation, annulation, contrat, signature, suivi ou PDF prêt.',
    bullets: ['Queue fiable Supabase', 'Retry automatique', 'Messages propres en français'],
    accent: colors.green,
    icon: 'whatsapp',
  },
  {
    id: '12-rapports-whatsapp',
    title: 'Rapport flotte directement sur WhatsApp',
    eyebrow: 'Commande rapport',
    body: 'Le bot peut envoyer un rapport PDF de la flotte avec résumé, réservations, contrats et suivi.',
    bullets: ['Commande “rapport”', 'PDF complet', 'Planification quotidienne possible'],
    accent: colors.deep,
    icon: 'report',
  },
  {
    id: '13-google-sheets',
    title: 'Synchronisation Google Sheets',
    eyebrow: 'Google Sheets',
    body: 'Les données peuvent être synchronisées vers Google Sheets pour garder un tableau externe exploitable.',
    bullets: ['Agence connectée', 'Données structurées', 'Historique facile à exporter'],
    accent: colors.yellow,
    icon: 'sheet',
  },
  {
    id: '14-google-drive',
    title: 'Contrats sauvegardés sur Google Drive',
    eyebrow: 'Google Drive',
    body: 'Les contrats PDF peuvent être déposés dans le Drive client ou agence selon la configuration.',
    bullets: ['Archivage externe', 'PDF de contrat', 'Accès client simplifié'],
    accent: colors.blue,
    icon: 'drive',
  },
  {
    id: '15-finance',
    title: 'Suivi financier par véhicule',
    eyebrow: 'Finance',
    body: 'Gardez un oeil sur les revenus, tarifs jour, dépenses, coûts de maintenance et performance de chaque voiture.',
    bullets: ['Revenus et dépenses', 'Vue par voiture', 'Décisions plus rapides'],
    accent: colors.green,
    icon: 'money',
  },
  {
    id: '16-tracking',
    title: 'Tracking et contrôle opérationnel',
    eyebrow: 'Tracking',
    body: 'Un espace pour suivre les éléments qui bougent: véhicules, locations, échéances et actions à traiter.',
    bullets: ['Vue par type', 'Priorités visibles', 'Moins d’oublis'],
    accent: colors.red,
    icon: 'pin',
  },
  {
    id: '17-parametres',
    title: 'Paramètres agence et identité',
    eyebrow: 'Agence',
    body: 'Logo, cachet, informations légales, téléphone WhatsApp, règles de documents et préférences restent configurables.',
    bullets: ['Branding agence', 'WhatsApp propriétaire', 'Documents personnalisables'],
    accent: colors.navy,
    icon: 'settings',
  },
  {
    id: '18-securite',
    title: 'Connexion sécurisée et sessions protégées',
    eyebrow: 'Sécurité',
    body: 'Authentification Supabase, stockage de session chiffré côté Android et règles RLS pour isoler les agences.',
    bullets: ['Session mobile chiffrée', 'Accès par agence', 'Gestion des erreurs propre'],
    accent: colors.deep,
    icon: 'lock',
  },
  {
    id: '19-installation-mobile',
    title: 'Installation mobile simple',
    eyebrow: 'Guide',
    body: 'Télécharger l’APK, installer, autoriser si nécessaire, connecter le compte agence et commencer à gérer les opérations.',
    bullets: ['APK Android', 'Connexion propriétaire', 'Données synchronisées'],
    accent: colors.blue,
    icon: 'download',
  },
  {
    id: '20-process-location',
    title: 'Flux complet d’une location',
    eyebrow: 'Workflow',
    body: 'Client, véhicule, réservation, contrat, signature, PDF, notification, retour et suivi: chaque étape est reliée.',
    bullets: ['Créer réservation', 'Transformer en contrat', 'Signer et archiver'],
    accent: colors.green,
    icon: 'flow',
  },
]

const story = [
  ['Réserver', 'Choisir client, voiture, dates et montant.'],
  ['Notifier', 'WhatsApp informe le propriétaire automatiquement.'],
  ['Contracter', 'Créer le contrat, générer le PDF et partager le lien.'],
  ['Signer', 'Le client signe depuis son téléphone.'],
  ['Suivre', 'Retour, entretien, dépenses et documents restent à jour.'],
]

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function icon(name, x, y, size, color = colors.navy) {
  const s = size
  const common = `fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`
  const cx = x + s / 2
  const cy = y + s / 2
  const map = {
    dashboard: `<rect x="${x+8}" y="${y+10}" width="${s-16}" height="${s-20}" rx="10" ${common}/><path d="M${x+24} ${y+42}h22M${x+24} ${y+60}h42M${x+24} ${y+78}h32" ${common}/><circle cx="${x+s-30}" cy="${y+38}" r="10" ${common}/>`,
    phone: `<rect x="${x+24}" y="${y+6}" width="${s-48}" height="${s-12}" rx="14" ${common}/><path d="M${cx-10} ${y+18}h20M${cx-6} ${y+s-16}h12" ${common}/><path d="M${x+38} ${y+44}h44M${x+38} ${y+62}h32" ${common}/>`,
    chart: `<path d="M${x+18} ${y+s-18}V${y+20}" ${common}/><path d="M${x+18} ${y+s-18}H${x+s-18}" ${common}/><path d="M${x+30} ${y+72}l18-20 18 10 24-34" ${common}/>`,
    calendar: `<rect x="${x+12}" y="${y+20}" width="${s-24}" height="${s-30}" rx="12" ${common}/><path d="M${x+30} ${y+10}v22M${x+s-30} ${y+10}v22M${x+12} ${y+44}h${s-24}" ${common}/><path d="M${x+34} ${y+66}h18M${x+66} ${y+66}h18M${x+34} ${y+86}h18" ${common}/>`,
    contract: `<path d="M${x+26} ${y+8}h38l22 22v70H${x+26}z" ${common}/><path d="M${x+64} ${y+8}v26h26M${x+38} ${y+52}h38M${x+38} ${y+70}h30M${x+38} ${y+88}h42" ${common}/>`,
    signature: `<path d="M${x+18} ${y+78}c20-36 30-46 34-32 4 16-10 40 2 40 10 0 18-28 28-24 8 3 2 22 12 22 6 0 10-7 16-12" ${common}/><path d="M${x+18} ${y+96}h88" ${common}/>`,
    car: `<path d="M${x+18} ${y+68}l8-24c3-9 10-14 20-14h28c10 0 17 5 20 14l8 24" ${common}/><rect x="${x+14}" y="${y+62}" width="${s-28}" height="30" rx="10" ${common}/><circle cx="${x+36}" cy="${y+94}" r="8" ${common}/><circle cx="${x+s-36}" cy="${y+94}" r="8" ${common}/><path d="M${x+42} ${y+44}h36" ${common}/>`,
    wrench: `<path d="M${x+80} ${y+20}a25 25 0 0 0-30 31L${x+18} ${y+83}l17 17 32-32a25 25 0 0 0 31-30l-18 18-16-16z" ${common}/>`,
    tools: `<path d="M${x+24} ${y+18}l28 28M${x+18} ${y+24}l14-14 28 28-14 14zM${x+58} ${y+62}l32 32" ${common}/><path d="M${x+88} ${y+24}l-46 46" ${common}/>`,
    users: `<circle cx="${x+42}" cy="${y+38}" r="16" ${common}/><path d="M${x+16} ${y+92}c4-24 48-24 52 0" ${common}/><circle cx="${x+78}" cy="${y+44}" r="12" ${common}/><path d="M${x+68} ${y+86}c7-14 32-13 36 4" ${common}/>`,
    whatsapp: `<path d="M${cx} ${y+16}a42 42 0 0 1 36 64l6 22-23-6A42 42 0 1 1 ${cx} ${y+16}z" ${common}/><path d="M${x+42} ${y+46}c5 18 18 30 36 36l10-10-15-9-7 6c-8-4-14-10-18-18l6-7-9-15z" ${common}/>`,
    report: `<rect x="${x+20}" y="${y+14}" width="${s-40}" height="${s-20}" rx="10" ${common}/><path d="M${x+38} ${y+78}V${y+58}M${x+58} ${y+78}V${y+42}M${x+78} ${y+78}V${y+64}M${x+32} ${y+90}h60" ${common}/>`,
    sheet: `<rect x="${x+18}" y="${y+14}" width="${s-36}" height="${s-28}" rx="8" ${common}/><path d="M${x+18} ${y+42}h${s-36}M${x+18} ${y+66}h${s-36}M${x+48} ${y+14}v${s-28}M${x+78} ${y+14}v${s-28}" ${common}/>`,
    drive: `<path d="M${x+46} ${y+18}h28l34 60-14 24H${x+66}z" ${common}/><path d="M${x+46} ${y+18}L${x+14} ${y+78}l14 24h38M${x+14} ${y+78}h66" ${common}/>`,
    money: `<rect x="${x+14}" y="${y+30}" width="${s-28}" height="58" rx="12" ${common}/><circle cx="${cx}" cy="${y+59}" r="14" ${common}/><path d="M${x+28} ${y+46}h1M${x+s-30} ${y+74}h1" ${common}/>`,
    pin: `<path d="M${cx} ${y+12}c20 0 34 15 34 34 0 25-34 56-34 56S${cx-34} ${y+71} ${cx-34} ${y+46}c0-19 14-34 34-34z" ${common}/><circle cx="${cx}" cy="${y+46}" r="11" ${common}/>`,
    settings: `<circle cx="${cx}" cy="${cy}" r="16" ${common}/><path d="M${cx} ${y+14}v15M${cx} ${y+s-14}v-15M${x+14} ${cy}h15M${x+s-14} ${cy}h-15M${x+31} ${y+31}l11 11M${x+s-31} ${y+s-31}l-11-11M${x+s-31} ${y+31}l-11 11M${x+31} ${y+s-31}l11-11" ${common}/>`,
    lock: `<rect x="${x+22}" y="${y+48}" width="${s-44}" height="48" rx="10" ${common}/><path d="M${x+38} ${y+48}V${y+36}a22 22 0 0 1 44 0v12" ${common}/>`,
    download: `<path d="M${cx} ${y+16}v52M${cx-20} ${y+50}l20 20 20-20M${x+22} ${y+92}h${s-44}" ${common}/>`,
    flow: `<circle cx="${x+24}" cy="${cy}" r="12" ${common}/><circle cx="${cx}" cy="${cy}" r="12" ${common}/><circle cx="${x+s-24}" cy="${cy}" r="12" ${common}/><path d="M${x+36} ${cy}h28M${cx+12} ${cy}h28" ${common}/>`,
  }
  return map[name] ?? map.dashboard
}

function cardSvg(card, index) {
  const w = 1080
  const h = 1080
  const accent = card.accent
  const bulletY = 690
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(card.title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#F8FAFC"/>
      <stop offset="1" stop-color="#E9EDF2"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#071B3D" flood-opacity=".14"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" rx="0" fill="url(#bg)"/>
  <rect x="64" y="64" width="952" height="952" rx="38" fill="#fff" filter="url(#shadow)"/>
  <rect x="64" y="64" width="952" height="154" rx="38" fill="${accent}"/>
  <rect x="64" y="178" width="952" height="40" fill="${accent}"/>
  <circle cx="142" cy="141" r="44" fill="#fff"/>
  <image href="../rentiq-logo.png" x="104" y="103" width="76" height="76" preserveAspectRatio="xMidYMid meet"/>
  <text x="214" y="132" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#fff">RENTIQ</text>
  <text x="214" y="171" font-family="Arial, sans-serif" font-size="24" fill="#DCEBFF">Système location de voitures</text>
  <text x="900" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#fff">${String(index + 1).padStart(2, '0')}</text>
  <g transform="translate(760 278)">
    <circle cx="100" cy="100" r="100" fill="${accent}" opacity=".12"/>
    <circle cx="100" cy="100" r="74" fill="#fff"/>
    ${icon(card.icon, 42, 42, 116, accent)}
  </g>
  <text x="112" y="330" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="${accent}" letter-spacing="2">${esc(card.eyebrow).toUpperCase()}</text>
  ${wrapText(card.title, 112, 420, 58, 780, colors.ink, 800)}
  ${wrapText(card.body, 112, 585, 33, 710, colors.muted, 400)}
  ${card.bullets.map((b, i) => `
    <circle cx="128" cy="${bulletY + i * 64}" r="11" fill="${accent}"/>
    <text x="160" y="${bulletY + 11 + i * 64}" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="${colors.ink}">${esc(b)}</text>`).join('')}
  <rect x="112" y="932" width="856" height="2" fill="${colors.line}"/>
  <text x="112" y="975" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${colors.muted}">Mobile Android · Web App · Bot WhatsApp · PDF · Google</text>
</svg>`
}

function wrapText(text, x, y, size, maxWidth, color, weight) {
  const words = String(text).split(/\s+/)
  const approx = size * 0.54
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length * approx > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.map((l, i) => `<text x="${x}" y="${y + i * size * 1.18}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(l)}</text>`).join('\n  ')
}

function storySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img" aria-label="Workflow Rentiq">
  <rect width="1080" height="1920" fill="${colors.gray}"/>
  <rect x="56" y="56" width="968" height="1808" rx="44" fill="#fff"/>
  <circle cx="150" cy="146" r="48" fill="${colors.navy}"/>
  <image href="../rentiq-logo.png" x="110" y="106" width="80" height="80"/>
  <text x="224" y="142" font-family="Arial, sans-serif" font-size="46" font-weight="900" fill="${colors.ink}">Le flux complet Rentiq</text>
  <text x="224" y="190" font-family="Arial, sans-serif" font-size="29" fill="${colors.muted}">De la réservation au suivi véhicule</text>
  ${story.map((s, i) => {
    const y = 330 + i * 285
    const accent = [colors.blue, colors.green, colors.deep, colors.yellow, colors.red][i]
    return `<circle cx="170" cy="${y}" r="54" fill="${accent}"/><text x="170" y="${y+13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#fff">${i+1}</text>${i < story.length - 1 ? `<path d="M170 ${y+62}v158" stroke="${colors.line}" stroke-width="8" stroke-linecap="round"/>` : ''}<text x="260" y="${y-8}" font-family="Arial, sans-serif" font-size="43" font-weight="900" fill="${colors.ink}">${esc(s[0])}</text><text x="260" y="${y+42}" font-family="Arial, sans-serif" font-size="30" fill="${colors.muted}">${esc(s[1])}</text>`
  }).join('\n  ')}
  <rect x="112" y="1740" width="856" height="70" rx="18" fill="${colors.navy}"/>
  <text x="540" y="1786" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#fff">Rentiq garde chaque étape connectée</text>
</svg>`
}

function html() {
  const featureRows = [
    ['Flotte', 'Voitures, photos, documents, disponibilité, dépenses et historique.'],
    ['Réservations', 'Planning, statuts, disponibilité, annulation archivée et notifications.'],
    ['Contrats', 'Création, PDF, aperçu, partage, signature client et clôture.'],
    ['Clients', 'Fiche client, CIN, permis, téléphone et historique complet.'],
    ['Suivi', 'Vidange, pneus, freins, assurance, vignette, visite technique et échéances.'],
    ['Finance', 'Revenus, tarifs, coûts, dépenses et performance par véhicule.'],
    ['WhatsApp', 'Notifications automatiques, rapport PDF et suivi de queue.'],
    ['Google', 'Synchronisation Sheets et sauvegarde de contrats Drive.'],
    ['Sécurité', 'Sessions mobiles chiffrées, accès agence et règles Supabase.'],
  ]
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rentiq · Kit marketing</title>
  <link rel="icon" href="./rentiq-logo.png" />
  <style>
    :root{--navy:#003B95;--blue:#0071C2;--ink:#172033;--muted:#5F6B7A;--bg:#E9EDF2;--line:#D3DAE3;--card:#fff;--green:#008A45;--red:#D4112F;--yellow:#FFB700}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--ink)}a{color:inherit}
    .hero{background:var(--navy);color:#fff;padding:42px 20px 34px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;gap:18px;align-items:center}.brand img{width:72px;height:72px;background:white;border-radius:20px;padding:8px}.eyebrow{font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#BFD8FF;font-size:13px}.hero h1{font-size:clamp(38px,6vw,76px);line-height:.95;margin:22px 0 16px;max-width:900px}.hero p{font-size:22px;line-height:1.45;max-width:850px;color:#EAF3FF}.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}.btn{border:0;border-radius:8px;padding:13px 18px;background:#fff;color:var(--navy);font-weight:800;text-decoration:none}.btn.secondary{background:#0B56B5;color:#fff}
    main{padding:30px 20px 70px}.section{max-width:1180px;margin:0 auto 34px}.section h2{font-size:30px;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.panel{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:18px}.panel strong{display:block;font-size:18px;margin-bottom:8px}.panel p{margin:0;color:var(--muted);line-height:1.5}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}.asset{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}.asset img{display:block;width:100%;background:#f8fafc}.asset div{padding:12px 14px;display:flex;justify-content:space-between;gap:12px;align-items:center}.asset span{font-weight:800;font-size:14px}.asset a{font-size:13px;color:var(--blue);font-weight:800;text-decoration:none}.guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.step{display:flex;gap:14px}.num{width:38px;height:38px;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:900;flex:0 0 auto}.footer{border-top:1px solid var(--line);padding-top:24px;color:var(--muted)}
  </style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <div class="brand"><img src="./rentiq-logo.png" alt="Rentiq"><div><div class="eyebrow">Kit marketing officiel</div><strong>Rentiq · Système location de voitures</strong></div></div>
      <h1>Présentez votre mobile app et web app avec des visuels prêts à publier.</h1>
      <p>Ce dossier rassemble les supports en français pour Instagram, WhatsApp, site vitrine, installation, démonstration commerciale et explication des fonctionnalités.</p>
      <div class="cta"><a class="btn" href="#visuels">Voir les visuels</a><a class="btn secondary" href="#guide">Guide installation</a></div>
    </div>
  </header>
  <main>
    <section class="section">
      <h2>Fonctionnalités couvertes</h2>
      <div class="grid">${featureRows.map(([a,b]) => `<article class="panel"><strong>${esc(a)}</strong><p>${esc(b)}</p></article>`).join('')}</div>
    </section>
    <section class="section" id="guide">
      <h2>Guide installation rapide</h2>
      <div class="guide">
        ${['Télécharger l’APK Android fourni par l’agence.', 'Installer l’application et autoriser l’installation si Android le demande.', 'Se connecter avec le compte agence Rentiq.', 'Configurer le numéro WhatsApp propriétaire dans les paramètres.', 'Créer une voiture, un client, puis une réservation test.', 'Générer un contrat, partager le lien de signature et vérifier le PDF.'].map((t, i) => `<article class="panel step"><div class="num">${i+1}</div><p>${esc(t)}</p></article>`).join('')}
      </div>
    </section>
    <section class="section" id="visuels">
      <h2>Visuels carrés pour posts</h2>
      <div class="gallery">${cards.map((c, i) => `<article class="asset"><img src="./images/${c.id}.svg" alt="${esc(c.title)}"><div><span>${String(i+1).padStart(2,'0')} · ${esc(c.eyebrow)}</span><a href="./images/${c.id}.svg" download>Télécharger</a></div></article>`).join('')}</div>
    </section>
    <section class="section">
      <h2>Story verticale</h2>
      <article class="asset"><img src="./images/21-story-workflow.svg" alt="Workflow Rentiq"><div><span>Story · Workflow complet</span><a href="./images/21-story-workflow.svg" download>Télécharger</a></div></article>
    </section>
    <section class="section footer">
      <p>Conseil: les fichiers SVG sont des images vectorielles. Vous pouvez les publier directement si la plateforme l’accepte, ou les ouvrir dans Chrome/Figma/Canva pour exporter en PNG.</p>
    </section>
  </main>
</body>
</html>`
}

function readme() {
  return `# Kit marketing Rentiq

Ce dossier contient des visuels en francais pour presenter la mobile app, la web app et le bot WhatsApp Rentiq.

## Contenu

- \`index.html\` : page catalogue propre avec toutes les fonctionnalites.
- \`rentiq-logo.png\` : logo utilise par les supports.
- \`images/*.svg\` : visuels carres pour Instagram, WhatsApp, site web ou presentation.
- \`images/21-story-workflow.svg\` : format story vertical pour expliquer le flux complet.

## Fonctionnalites couvertes

Flotte, reservations, contrats, signature client, PDF, clients, suivi maintenance, documents, finance, tracking, WhatsApp, rapports, Google Sheets, Google Drive, securite, parametres agence et installation mobile.

## Export PNG

Ouvrir un fichier SVG dans Chrome, Figma ou Canva, puis exporter en PNG. Les visuels carres sont en 1080 x 1080 et la story en 1080 x 1920.
`
}

await fs.mkdir(imgDir, { recursive: true })
try {
  await fs.copyFile(logoSrc, logoOut)
} catch {
  // The HTML and SVGs still render without the logo file, but the normal repo has it.
}

await Promise.all(cards.map((card, index) => fs.writeFile(path.join(imgDir, `${card.id}.svg`), cardSvg(card, index), 'utf8')))
await fs.writeFile(path.join(imgDir, '21-story-workflow.svg'), storySvg(), 'utf8')
await fs.writeFile(path.join(outDir, 'index.html'), html(), 'utf8')
await fs.writeFile(path.join(outDir, 'README.md'), readme(), 'utf8')

console.log(`Generated ${cards.length + 1} visuals in ${path.relative(root, outDir)}`)
