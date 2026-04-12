import type { NextConfig } from 'next'

// 書影として許可する画像ホスト一覧。
// packages/shared/src/schemas/book-schema.ts の ALLOWED_THUMBNAIL_HOSTS と同期させる。
const ALLOWED_IMG_HOSTS = [
  'https://m.media-amazon.com',
  'https://images-na.ssl-images-amazon.com',
  'https://images-fe.ssl-images-amazon.com',
  'https://pics.dmm.co.jp',
  'https://p.dmm.co.jp',
  'https://thumbnail.image.rakuten.co.jp',
  'https://books.google.com',
].join(' ')

const CSP_VALUE = [
  "default-src 'self'",
  `img-src 'self' data: ${ALLOWED_IMG_HOSTS}`,
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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
