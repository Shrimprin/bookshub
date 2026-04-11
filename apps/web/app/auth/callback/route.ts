import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    // PKCE code exchange — @supabase/ssr が自動的に cookie にセッションを保存する
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/bookshelf`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
