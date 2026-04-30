'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

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
    <Card className="w-full max-w-sm border-primary/30 shadow-glow-soft">
      <CardHeader>
        <CardTitle className="bg-gradient-to-r from-primary to-secondary bg-clip-text font-display text-2xl text-transparent">
          BookHub にログイン
        </CardTitle>
        <CardDescription>Google アカウントでログインしてください</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        <Button onClick={handleGoogleLogin} disabled={isLoading} variant="neon" className="w-full">
          {isLoading ? 'リダイレクト中...' : 'Google でログイン'}
        </Button>
      </CardContent>
    </Card>
  )
}
