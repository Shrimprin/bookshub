import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.BOOKHUB_API_URL || 'http://localhost:3000'),
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
})
