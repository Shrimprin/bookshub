import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// mode=production（`vite build --mode production`）のときのみ HTTPS を強制
// 通常の `vite build` は mode=production だが、開発用ビルドでは `--mode development` を使う
export default defineConfig(({ mode }) => {
  const apiUrl = process.env.BOOKHUB_API_URL || 'http://localhost:3000'

  if (mode === 'production') {
    if (!process.env.BOOKHUB_API_URL) {
      throw new Error('BOOKHUB_API_URL must be set for production builds')
    }
    if (!apiUrl.startsWith('https://')) {
      throw new Error('BOOKHUB_API_URL must use HTTPS for production builds')
    }
  }

  return {
    plugins: [crx({ manifest })],
    define: {
      __API_BASE_URL__: JSON.stringify(apiUrl),
    },
    server: {
      cors: {
        origin: [/chrome-extension:\/\//],
      },
    },
  }
})
