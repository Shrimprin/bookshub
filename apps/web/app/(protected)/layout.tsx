import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExtensionTokenBridge } from '@/components/auth/extension-token-bridge'
import { SiteHeader } from '@/components/layout/site-header'

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <>
      <ExtensionTokenBridge />
      <SiteHeader />
      {children}
    </>
  )
}
