import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for /fleet — renders the list (index) or a vehicle detail child.
export const Route = createFileRoute('/_app/fleet')({
  component: () => <Outlet />,
})
