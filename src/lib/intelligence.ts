// ── Vehicle Intelligence engine ────────────────────────────────────────────
// The whole point of "Suivi Intelligent": stop asking the user to reason about
// maintenance. Answer one question instead —
//
//     Can this car be rented today, without risk?
//
// This module is PURE (no I/O, no i18n) so it runs identically on server and
// client and is trivially testable. It folds the three data sources the app
// already tracks — legal papers, mechanical service, and open issues — into a
// single operational verdict plus the reasons behind it.
//
// Labels are returned as { key, params } translation descriptors; the caller
// resolves them with t(). Never bake human text in here.

import type { CondStatus } from './fleet'
import type { ServiceStatus } from './maintenance'

// The car's operational state, worst-first. Exactly one is chosen per vehicle.
export type OpStatus =
  | 'rentable' // Prête à louer
  | 'watch' // À surveiller
  | 'service_soon' // Maintenance bientôt
  | 'not_rentable' // Non louable (technique)
  | 'garage' // Au garage
  | 'blocked_admin' // Bloquée administrativement
  | 'blocked_accident' // Bloquée pour accident

// Severity order for picking the dominant status (lower = more severe).
export const OP_RANK: Record<OpStatus, number> = {
  blocked_accident: 0,
  garage: 1,
  blocked_admin: 2,
  not_rentable: 3,
  service_soon: 4,
  watch: 5,
  rentable: 6,
}

// A car is off the road for these; the rest can still go out (with caution).
const NON_RENTABLE: OpStatus[] = ['blocked_accident', 'garage', 'blocked_admin', 'not_rentable']

export function isRentable(status: OpStatus): boolean {
  return !NON_RENTABLE.includes(status)
}

export function opTone(status: OpStatus): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'rentable') return 'ok'
  if (status === 'watch' || status === 'service_soon') return 'warn'
  return 'danger'
}

// A translatable message with interpolation params. `key` is an i18n key.
export type Msg = { key: string; params?: Record<string, string | number> }

// A reason the car is blocked (hard) or worth watching (soft), each with a
// concrete "what to do now" action so the UI never just says "problem".
export type Reason = {
  code: string // stable id for React keys / dedupe
  label: Msg
  action: Msg
  severity: 'block' | 'warn'
  issueId?: string // when the reason is a specific open issue
}

// ── Engine inputs (decoupled from server row shapes) ────────────────────────
export type LegalInput = {
  code: string // insurance / vignette / visite / <custom doc code>
  label: string // already-resolved display name (caller has i18n)
  status: CondStatus
  daysLeft: number | null
  date: string | null
}

export type ServiceInput = {
  type: string // vidange / courroie / freins / pneus / filtre / batterie
  label: string // already-resolved display name
  status: ServiceStatus
  kmLeft: number | null
  etaDays: number | null
  daysLeft: number | null
  // Per-type: does an overdue lapse ground the car (oil/timing belt) or is it
  // only an inspect/replace advisory (brakes/tyres/filter/battery)?
  blocksRental: boolean
}

export type IssueInput = {
  id: string
  kind: string // problem / accident / admin / cleaning / garage
  severity: 'low' | 'medium' | 'critical'
  status: string // open / in_progress / resolved
  blocks_rental: boolean
  title: string
}

export type VehicleState = {
  status: OpStatus
  rentable: boolean
  blocks: Reason[]
  alerts: Reason[]
  nextAction: Msg | null
  scoreTech: number // 0..100
  scoreAdmin: number // 0..100
  scoreOverall: number // 0..100
}

// Legal papers whose expiry makes the car illegal to drive → admin block.
// (A custom document type is treated as advisory: warn, don't block.)
const STATUTORY = new Set(['insurance', 'vignette', 'visite'])

export function computeVehicleState(opts: {
  legal: LegalInput[]
  service: ServiceInput[]
  issues: IssueInput[]
}): VehicleState {
  const { legal, service, issues } = opts
  const open = issues.filter((i) => i.status !== 'resolved')

  const blocks: Reason[] = []
  const alerts: Reason[] = []
  let status: OpStatus = 'rentable'
  const worse = (s: OpStatus) => {
    if (OP_RANK[s] < OP_RANK[status]) status = s
  }

  // ── Issues ──
  for (const i of open) {
    if (i.kind === 'accident') {
      worse('blocked_accident')
      blocks.push({
        code: `issue-${i.id}`,
        issueId: i.id,
        severity: 'block',
        label: { key: 'si.blkAccident', params: { title: i.title } },
        action: { key: 'si.actAccident' },
      })
      continue
    }
    if (i.kind === 'garage' || i.status === 'in_progress') {
      worse('garage')
      blocks.push({
        code: `issue-${i.id}`,
        issueId: i.id,
        severity: 'block',
        label: { key: 'si.blkGarage', params: { title: i.title } },
        action: { key: 'si.actGarage' },
      })
      continue
    }
    const isBlocking = i.blocks_rental || i.severity === 'critical'
    if (isBlocking) {
      worse('not_rentable')
      blocks.push({
        code: `issue-${i.id}`,
        issueId: i.id,
        severity: 'block',
        label: { key: 'si.blkProblem', params: { title: i.title } },
        action: { key: 'si.actProblem' },
      })
    } else {
      worse('watch')
      alerts.push({
        code: `issue-${i.id}`,
        issueId: i.id,
        severity: 'warn',
        label: { key: 'si.wrnProblem', params: { title: i.title } },
        action: { key: 'si.actProblem' },
      })
    }
  }

  // ── Legal papers ──
  for (const l of legal) {
    if (l.status === 'expired') {
      if (STATUTORY.has(l.code)) {
        worse('blocked_admin')
        blocks.push({
          code: `legal-${l.code}`,
          severity: 'block',
          label: { key: 'si.blkLegalExpired', params: { doc: l.label } },
          action: { key: 'si.actRenew', params: { doc: l.label } },
        })
      } else {
        worse('watch')
        alerts.push({
          code: `legal-${l.code}`,
          severity: 'warn',
          label: { key: 'si.wrnDocExpired', params: { doc: l.label } },
          action: { key: 'si.actRenew', params: { doc: l.label } },
        })
      }
    } else if (l.status === 'soon') {
      worse('watch')
      alerts.push({
        code: `legal-${l.code}`,
        severity: 'warn',
        label: { key: 'si.wrnLegalSoon', params: { doc: l.label, n: l.daysLeft ?? 0 } },
        action: { key: 'si.actRenew', params: { doc: l.label } },
      })
    }
  }

  // ── Mechanical service ──
  for (const s of service) {
    if (s.status === 'expired') {
      if (s.blocksRental) {
        // Oil / timing belt: driving overdue is a real mechanical risk → ground it.
        worse('not_rentable')
        blocks.push({
          code: `svc-${s.type}`,
          severity: 'block',
          label: { key: 'si.blkServiceOverdue', params: { svc: s.label } },
          action: { key: 'si.actService', params: { svc: s.label } },
        })
      } else {
        // Brakes / tyres / filter / battery: advisory (inspect / replace), not a blocker.
        worse('watch')
        alerts.push({
          code: `svc-${s.type}`,
          severity: 'warn',
          label: { key: 'si.wrnServiceOverdue', params: { svc: s.label } },
          action: { key: 'si.actService', params: { svc: s.label } },
        })
      }
    } else if (s.status === 'soon') {
      worse('service_soon')
      alerts.push({
        code: `svc-${s.type}`,
        severity: 'warn',
        label: {
          key: 'si.wrnServiceSoon',
          params: { svc: s.label, n: s.etaDays ?? s.daysLeft ?? 0 },
        },
        action: { key: 'si.actService', params: { svc: s.label } },
      })
    }
  }

  // ── Scores ──
  const scoreAdmin = scoreFromLegal(legal)
  const scoreTech = scoreFromService(service, open)
  const scoreOverall = Math.round((scoreAdmin + scoreTech) / 2)

  // ── Next action ── first block, else first alert, else nothing.
  const nextAction = blocks[0]?.action ?? alerts[0]?.action ?? null

  return {
    status,
    rentable: isRentable(status),
    blocks,
    alerts,
    nextAction,
    scoreTech,
    scoreAdmin,
    scoreOverall,
  }
}

const CS_WEIGHT: Record<CondStatus, number> = { ok: 100, soon: 55, expired: 0, unknown: 60 }
const SS_WEIGHT: Record<ServiceStatus, number> = { ok: 100, soon: 50, expired: 0, unknown: 70 }

function scoreFromLegal(legal: LegalInput[]): number {
  if (legal.length === 0) return 100
  const sum = legal.reduce((a, l) => a + CS_WEIGHT[l.status], 0)
  return Math.round(sum / legal.length)
}

function scoreFromService(service: ServiceInput[], openIssues: IssueInput[]): number {
  const base = service.length
    ? Math.round(service.reduce((a, s) => a + SS_WEIGHT[s.status], 0) / service.length)
    : 100
  // Penalise open technical issues on top of the schedule score.
  let penalty = 0
  for (const i of openIssues) {
    if (i.kind === 'admin' || i.kind === 'cleaning') continue
    penalty += i.severity === 'critical' ? 40 : i.severity === 'medium' ? 18 : 7
  }
  return Math.max(0, Math.min(100, base - penalty))
}
