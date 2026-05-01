// CSP nonce はリクエスト毎に再生成し、推測不可能でなければならない。
// 128bit (16 bytes) のランダム値を base64 エンコードして返す。
// `crypto.getRandomValues` と `btoa` は Edge Runtime / Cloudflare Workers Runtime の
// どちらでもサポートされており、`Buffer` のような Node.js 専用 API に依存しない。
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
