import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Noto_Sans_JP, Orbitron } from 'next/font/google'
import { headers } from 'next/headers'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansJp = Noto_Sans_JP({
  // Google Fonts の Noto Sans JP は `'japanese'` サブセットを公開しておらず (CJK は unicode-range で配信される)、
  // `latin` だけプリロードしても日本語の FOUT 抑制には役立たない。誤解を招く preload タグを抑止して on-demand ロードに任せる。
  subsets: ['latin'],
  preload: false,
  variable: '--font-noto-sans-jp',
  display: 'swap',
  weight: ['400', '500', '700'],
})

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  // LP の Orbitron 大見出しは LCP 候補。swap → optional でフォントスワップ起因の CLS を排除し、
  // ロード遅延時はフォールバックを最後まで使う。
  display: 'optional',
  weight: ['500', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BookHub',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // middleware が per-request で生成した nonce を受け取り、next-themes の inline 初期化スクリプトに
  // 渡す。これがないと strict-dynamic 配下で next-themes の inline script が CSP 違反でブロックされ、
  // FOUC やテーマ初期化失敗を引き起こす。Next.js が出力する RSC ハイドレーションスクリプトには
  // x-nonce request header から自動付与されるため、追加対応は不要。
  // exactOptionalPropertyTypes: true 配下で nonce?: string に undefined を直接渡せないため、
  // x-nonce が無い経路 (middleware を通らない / static 化されたケース) では prop ごと省略する。
  const nonce = (await headers()).get('x-nonce')
  const themeProviderNonce = nonce ? { nonce } : {}

  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${inter.variable} ${notoSansJp.variable} ${orbitron.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-background text-foreground font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          {...themeProviderNonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
