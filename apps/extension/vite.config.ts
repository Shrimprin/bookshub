import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

const apiUrl = process.env.BOOKHUB_API_URL || 'http://localhost:3000'

if (process.env.NODE_ENV === 'production') {
  if (!process.env.BOOKHUB_API_URL) {
    throw new Error('BOOKHUB_API_URL must be set for production builds')
  }
  if (!apiUrl.startsWith('https://')) {
    throw new Error('BOOKHUB_API_URL must use HTTPS for production builds')
  }
}

export default defineConfig({
  plugins: [crx({ manifest })],
  define: {
    __API_BASE_URL__: JSON.stringify(apiUrl),
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
})
