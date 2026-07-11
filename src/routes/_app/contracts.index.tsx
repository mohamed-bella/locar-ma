import { createFileRoute, redirect } from '@tanstack/react-router'

// Contracts were merged into reservations. The list now lives under /reservations;
// keep this URL working by redirecting.
export const Route = createFileRoute('/_app/contracts/')({
  beforeLoad: () => {
    throw redirect({ to: '/reservations' })
  },
})
