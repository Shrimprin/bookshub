import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">BookHub</h1>
      <p className="mt-4 text-lg text-gray-600">漫画ヘビーユーザー向け本棚管理サービス</p>
      <Button asChild className="mt-8">
        <Link href="/login">ログイン / 新規登録</Link>
      </Button>
    </main>
  )
}
