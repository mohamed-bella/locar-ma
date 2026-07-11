import { createFileRoute, redirect } from '@tanstack/react-router'
import { getContract } from '~/server/contracts'

// Contracts were merged into reservations. A contract now lives inline on its
// reservation's detail page; resolve the reservation and redirect there. Detached
// contracts (reservation_id null, e.g. 0027 orphans) fall back to the list.
export const Route = createFileRoute('/_app/contracts/$contractId')({
  beforeLoad: async ({ params }) => {
    const contract = await getContract({ data: { id: params.contractId } })
    if (contract?.reservation_id) {
      throw redirect({ to: '/reservations/$reservationId', params: { reservationId: contract.reservation_id } })
    }
    throw redirect({ to: '/reservations' })
  },
})
