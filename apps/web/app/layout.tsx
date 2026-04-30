import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Noto_Sans_JP, Orbitron } from 'next/font/google'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
