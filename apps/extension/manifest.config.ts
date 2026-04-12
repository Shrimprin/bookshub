import { defineManifest } from '@crxjs/vite-plugin'

// TODO(本番ドメイン確定後): production モードの externally_connectable.matches に
// Cloudflare Pages の URL (例: 'https://bookhub.pages.dev/*') を追加すること。
// PROD_ALLOWED_ORIGINS が空のまま production ビルドを行うと、Web→拡張機能の
// トークン受け渡し (chrome.runtime.onMessageExternal) が一切動かなくなり、
// すべてのスクレイプ操作が AUTH_ERROR を返す。
// 環境変数 BOOKHUB_ALLOWED_WEB_ORIGINS (カンマ区切り) で指定可能。
const DEV_ALLOWED_ORIGINS = ['http://localhost:3000/*']
const PROD_ALLOWED_ORIGINS: string[] = (process.env.BOOKHUB_ALLOWED_WEB_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

// Extension ID を dev/staging で固定化するための公開鍵 (base64)。
// vite.config.ts の loadEnv() 経由で process.env に注入される想定。
// 未設定の場合 key フィールドは omit される (ID が毎回変わる)。
const crxPublicKey = process.env.CRX_PUBLIC_KEY

// BOOKHUB_API_URL (Background が /api/scrape に POST する先) を host_permissions に
// 追加する。これがないと Chrome の CORS/セキュリティチェックで接続が切断される。
// URL の末尾に `/*` を付けて match pattern にする。
const apiBaseUrl = process.env.BOOKHUB_API_URL || 'http://localhost:3000'
const apiHostPermission = apiBaseUrl.replace(/\/$/, '') + '/*'

export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'BookHub',
  version: '0.0.1',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
  // 本番ビルドでは key を埋め込まない (Chrome Web Store が発行する ID を使う)
  ...(env.mode !== 'production' && crxPublicKey ? { key: crxPublicKey } : {}),
  // activeTab は現状不使用だが、将来的に手動スクレイピングトリガーで必要になる可能性あり
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://www.amazon.co.jp/*', 'https://book.dmm.com/*', apiHostPermission],
  externally_connectable: {
    matches: env.mode === 'production' ? PROD_ALLOWED_ORIGINS : DEV_ALLOWED_ORIGINS,
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'BookHub',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/kindle.ts'],
      matches: ['https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/*'],
      run_at: 'document_idle',
    },
    {
      js: ['src/content/dmm.ts'],
      matches: ['https://book.dmm.com/*'],
      run_at: 'document_idle',
    },
  ],
}))
