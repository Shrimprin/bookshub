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

  // externally_connectable で許可するオリジン一覧。
  // manifest.config.ts の externally_connectable.matches と Background SW の
  // isAllowedOrigin で使われる __ALLOWED_EXTERNAL_ORIGINS__ を同じ source of truth
  // (BOOKHUB_ALLOWED_WEB_ORIGINS) から導出する。Web app と API origin が異なる
  // 構成 (web=pages.dev, api=workers.dev 等) でも整合する。
  // dev では BOOKHUB_ALLOWED_WEB_ORIGINS が未設定でも動くように localhost を fallback。
  const webOriginPatterns = (process.env.BOOKHUB_ALLOWED_WEB_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const sourcePatterns =
    webOriginPatterns.length > 0 ? webOriginPatterns : ['http://localhost:3000/*']
  // match pattern (https://example.com/*) を origin (https://example.com) に正規化
  const allowedExternalOrigins = sourcePatterns.map((p) =>
    p.replace(/\/\*$/, '').replace(/\/$/, ''),
  )

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
