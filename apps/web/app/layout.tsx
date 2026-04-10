import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BookHub',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
