import type { NextConfig } from 'next'
import { ALLOWED_THUMBNAIL_HOSTS } from '@bookhub/shared'

// 書影として許可する画像ホスト一覧は @bookhub/shared から import して
// サーバー側スキーマ (POST 時の validate) と CSP img-src を単一ソースで同期する。
const IMG_HOSTS_CSP = ALLOWED_THUMBNAIL_HOSTS.map((host) => `https://${host}`).join(' ')

// TODO(#28): script-src 'unsafe-inline' を nonce 方式に置き換える。
// Next.js App Router の RSC ハイドレーションには現状インラインスクリプトが
// 必要で、middleware で per-request nonce を生成して style/script に差し込む
// リファクタが必要。今 PR では他の CSP ディレクティブの強化に留める。
//
// dev モードでは Next.js の React Refresh runtime が eval() を使うため
// 'unsafe-eval' が必要。本番には含めない。これがないと HMR runtime 初期化で
// CSP エラーが発生し、クライアント React ツリーがハイドレートされず、すべての
// useEffect / client component がサイレントに動作不能になる。
const isDev = process.env.NODE_ENV === 'development'
const SCRIPT_SRC = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"
const CSP_VALUE = [
  "default-src 'self'",
  `img-src 'self' data: ${IMG_HOSTS_CSP}`,
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: CSP_VALUE },
        ],
      },
    ]
  },
}

export default nextConfig
