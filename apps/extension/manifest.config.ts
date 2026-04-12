import { defineManifest } from '@crxjs/vite-plugin'

// TODO(本番ドメイン確定後): production モードの externally_connectable.matches に
// Cloudflare Pages の URL (例: 'https://bookhub.pages.dev/*') を追加すること
const DEV_ALLOWED_ORIGINS = ['http://localhost:3000/*']
const PROD_ALLOWED_ORIGINS: string[] = []

// Extension ID を dev/staging で固定化するための公開鍵 (base64)。
// vite.config.ts の loadEnv() 経由で process.env に注入される想定。
// 未設定の場合 key フィールドは omit される (ID が毎回変わる)。
const crxPublicKey = process.env.CRX_PUBLIC_KEY

export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'BookHub',
  version: '0.0.1',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
  // 本番ビルドでは key を埋め込まない (Chrome Web Store が発行する ID を使う)
  ...(env.mode !== 'production' && crxPublicKey ? { key: crxPublicKey } : {}),
  // activeTab は現状不使用だが、将来的に手動スクレイピングトリガーで必要になる可能性あり
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://www.amazon.co.jp/*', 'https://book.dmm.com/*'],
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
