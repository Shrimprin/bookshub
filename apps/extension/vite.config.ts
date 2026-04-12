import { defineConfig, loadEnv } from 'vite'
import { crx } from '@crxjs/vite-plugin'

// mode=production（`vite build --mode production`）のときのみ HTTPS を強制
// 通常の `vite build` は mode=production だが、開発用ビルドでは `--mode development` を使う
export default defineConfig(async ({ mode }) => {
  // apps/extension/.env, .env.local, .env.[mode], .env.[mode].local を読み込む
  // (prefix '' で全ての変数を読む、通常の VITE_ プレフィックス制限を無視)
  const env = loadEnv(mode, process.cwd(), '')

  // process.env にも反映して manifest.config.ts から参照できるようにする
  // (manifest.config.ts はトップレベルで process.env.CRX_PUBLIC_KEY を評価するため、
  //  loadEnv() 後に dynamic import する必要がある)
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  const apiUrl = process.env.BOOKHUB_API_URL || 'http://localhost:3000'
  const isProduction = mode === 'production'

  if (isProduction) {
    if (!process.env.BOOKHUB_API_URL) {
      throw new Error('BOOKHUB_API_URL must be set for production builds')
    }
    if (!apiUrl.startsWith('https://')) {
      throw new Error('BOOKHUB_API_URL must use HTTPS for production builds')
    }
    // 本番ビルド時に Web アプリのオリジンが未設定だと、externally_connectable
    // が空配列になり Web→拡張機能のトークン受け渡しがサイレントに失敗する
    if (!process.env.BOOKHUB_ALLOWED_WEB_ORIGINS) {
      throw new Error(
        'BOOKHUB_ALLOWED_WEB_ORIGINS must be set for production builds (e.g. "https://bookhub.pages.dev/*")',
      )
    }
  }

  // externally_connectable で許可するオリジン一覧
  // この値は Background Service Worker の origin 検証にも使われる
  const allowedExternalOrigins = [apiUrl]

  // loadEnv() の結果を process.env に反映した後で manifest.config を評価する。
  // トップレベル import では CRX_PUBLIC_KEY 未注入時に評価されてしまうため dynamic import を使う。
  const { default: manifest } = await import('./manifest.config')

  return {
    plugins: [crx({ manifest })],
    define: {
      __API_BASE_URL__: JSON.stringify(apiUrl),
      __ALLOWED_EXTERNAL_ORIGINS__: JSON.stringify(allowedExternalOrigins),
      __IS_DEV__: JSON.stringify(!isProduction),
    },
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
  }
})
