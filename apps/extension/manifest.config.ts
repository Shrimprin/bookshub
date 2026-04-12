import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'BookHub',
  version: '0.0.1',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
  // activeTab は現状不使用だが、将来的に手動スクレイピングトリガーで必要になる可能性あり
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://www.amazon.co.jp/*', 'https://book.dmm.com/*'],
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
})
