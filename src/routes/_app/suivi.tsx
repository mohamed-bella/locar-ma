import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for /suivi — renders the health grid (index) or a vehicle's
// intelligence overview child.
export const Route = createFileRoute('/_app/suivi')({
  component: () => <Outlet />,
})
