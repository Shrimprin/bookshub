import type { NextConfig } from 'next'
import { ALLOWED_THUMBNAIL_HOSTS } from '@bookhub/shared'

// 書影として許可する画像ホスト一覧は @bookhub/shared から import して
// サーバー側スキーマ (POST 時の validate) と CSP img-src を単一ソースで同期する。
const IMG_HOSTS_CSP = ALLOWED_THUMBNAIL_HOSTS.map((host) => `https://${host}`).join(' ')

// 本番 CSP: script-src は `'self' 'unsafe-inline'` のまま残存している。
// `unsafe-inline` は Next.js App Router の RSC ハイドレーション用インラインスクリプト
// のため現時点で必須。これを nonce 方式 (middleware で per-request nonce を style/script
// に差し込む) へ移行するリファクタリングは #28 で実施予定。未完了のため現状では XSS が
// 成立した場合のスクリプト注入耐性が限定的である点に注意。
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
