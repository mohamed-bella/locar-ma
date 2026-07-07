import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthState } from '~/server/auth'
import { LoginForm } from '~/components/LoginForm'

// Home IS the login page. Logged-in users skip to the app; everyone else sees
// the login form right here (no bounce to /login).
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const auth = await getAuthState()
    if (auth.user) throw redirect({ to: '/dashboard' })
  },
  component: LoginForm,
})
