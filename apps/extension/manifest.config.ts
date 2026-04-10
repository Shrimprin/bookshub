import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'BookHub',
  version: '0.0.1',
  description: '漫画ヘビーユーザー向け本棚管理・二度買い防止サービス',
  permissions: ['storage', 'activeTab', 'tabs'],
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
      matches: ['https://www.amazon.co.jp/*'],
      run_at: 'document_idle',
    },
    {
      js: ['src/content/dmm.ts'],
      matches: ['https://book.dmm.com/*'],
      run_at: 'document_idle',
    },
  ],
})
