import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.15),_transparent_60%),radial-gradient(circle_at_bottom,_hsl(var(--secondary)/0.1),_transparent_60%)]"
      />
      <main className="flex min-h-screen items-center justify-center p-4">
        <LoginForm />
      </main>
    </div>
  )
}
