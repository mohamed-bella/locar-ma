// Glue between the app's server row shapes and the pure intelligence engine.
// Builds LegalInput / ServiceInput / IssueInput from what the loaders already
// return, resolving display labels via a passed-in translator so the engine
// stays i18n-free.

import type { Vehicle } from '~/server/fleet'
import type { AlertRule } from '~/server/alertRules'
import type { DocumentType } from '~/server/documentTypes'
import type { FleetServiceRow } from '~/server/maintenance'
import type { OpenIssueLite } from '~/server/intelligence'
import { daysUntil, condStatus, thresholdFor } from './fleet'
import { allTrackers, trackerDate } from './tracking'
import { serviceBlocksRental } from './maintenance'
import { computeVehicleState, type LegalInput, type ServiceInput, type IssueInput, type VehicleState } from './intelligence'

type T = (k: string, v?: Record<string, string | number>) => string

export function legalInputs(
  vehicle: Vehicle,
  rules: AlertRule[],
  documentTypes: DocumentType[],
  t: T,
): LegalInput[] {
  return allTrackers(documentTypes).map((tr): LegalInput => {
    const date = trackerDate(vehicle, tr)
    const days = daysUntil(date)
    return {
      code: tr.code,
      label: tr.nameKey ? t(tr.nameKey) : (tr.name ?? tr.code),
      status: condStatus(days, thresholdFor(tr.field!, rules)),
      daysLeft: days,
      date,
    }
  })
}

export function serviceInputs(vehicleId: string, rows: FleetServiceRow[], t: T): ServiceInput[] {
  return rows
    .filter((r) => r.vehicle_id === vehicleId)
    .map((r): ServiceInput => ({
      type: r.type,
      label: t(`svc.type.${r.type}`),
      status: r.status,
      kmLeft: r.kmLeft,
      etaDays: r.etaDays,
      daysLeft: r.daysLeft,
      blocksRental: serviceBlocksRental(r.type),
    }))
}

export function issueInputs(issues: OpenIssueLite[]): IssueInput[] {
  return issues.map((i) => ({
    id: i.id,
    kind: i.kind,
    severity: i.severity,
    status: i.status,
    blocks_rental: i.blocks_rental,
    title: i.title,
  }))
}

// One-call convenience used by the grid: resolve a vehicle's full verdict.
export function stateForVehicle(opts: {
  vehicle: Vehicle
  serviceRows: FleetServiceRow[]
  issues: OpenIssueLite[]
  rules: AlertRule[]
  documentTypes: DocumentType[]
  t: T
}): VehicleState {
  const { vehicle, serviceRows, issues, rules, documentTypes, t } = opts
  return computeVehicleState({
    legal: legalInputs(vehicle, rules, documentTypes, t),
    service: serviceInputs(vehicle.id, serviceRows, t),
    issues: issueInputs(issues.filter((i) => i.vehicle_id === vehicle.id)),
  })
}
