'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError('ログインに失敗しました。もう一度お試しください。')
      setIsLoading(false)
    }
    // 成功時は Google にリダイレクトされるため setIsLoading(false) は不要
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>BookHub にログイン</CardTitle>
        <CardDescription>Google アカウントでログインしてください</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        <Button onClick={handleGoogleLogin} disabled={isLoading} className="w-full">
          {isLoading ? 'リダイレクト中...' : 'Google でログイン'}
        </Button>
      </CardContent>
    </Card>
  )
}
