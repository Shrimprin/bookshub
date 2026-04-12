import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// mode=production（`vite build --mode production`）のときのみ HTTPS を強制
// 通常の `vite build` は mode=production だが、開発用ビルドでは `--mode development` を使う
export default defineConfig(({ mode }) => {
  const apiUrl = process.env.BOOKHUB_API_URL || 'http://localhost:3000'
  const isProduction = mode === 'production'

  if (isProduction) {
    if (!process.env.BOOKHUB_API_URL) {
      throw new Error('BOOKHUB_API_URL must be set for production builds')
    }
    if (!apiUrl.startsWith('https://')) {
      throw new Error('BOOKHUB_API_URL must use HTTPS for production builds')
    }
  }

  // dev/staging では CRX_PUBLIC_KEY を指定することで Extension ID を固定化する
  // (Web アプリ側の NEXT_PUBLIC_EXTENSION_ID と合わせるため)
  // 本番ビルドでは Web Store から ID が決定されるため key は埋め込まない
  const publicKey = isProduction ? undefined : process.env.CRX_PUBLIC_KEY

  // externally_connectable で許可するオリジン一覧
  // この値は Background Service Worker の origin 検証にも使われる
  const allowedExternalOrigins = [apiUrl]

  return {
    plugins: [crx({ manifest, ...(publicKey ? { publicKey } : {}) })],
    define: {
      __API_BASE_URL__: JSON.stringify(apiUrl),
      __ALLOWED_EXTERNAL_ORIGINS__: JSON.stringify(allowedExternalOrigins),
    },
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
  }
})
