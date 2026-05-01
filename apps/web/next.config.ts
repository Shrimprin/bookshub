import type { NextConfig } from 'next'

// Content-Security-Policy は middleware (apps/web/middleware.ts) で per-request nonce を埋め込んだ
// 動的な値を response header に set する。ここに静的 CSP を残すと middleware の値と二重定義になり、
// 後から評価される側の値で上書きされる挙動が version 依存で不安定になるため、CSP は middleware
// に一元化する。img-src の許可ホスト一覧などもすべて apps/web/lib/csp/build-csp.ts に集約。
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
