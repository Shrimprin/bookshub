import { createClient } from '@/lib/supabase/server'

export default async function BookshelfPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">本棚</h1>
      <p className="mt-4 text-lg text-gray-600">ようこそ、{user?.email ?? 'ゲスト'} さん</p>
    </main>
  )
}
