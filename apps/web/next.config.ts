import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

if (process.env.NODE_ENV === 'development') {
  void import('@cloudflare/next-on-pages/next-dev').then(({ setupDevPlatform }) =>
    setupDevPlatform().catch((e: unknown) => console.error(e)),
  )
}

export default nextConfig
