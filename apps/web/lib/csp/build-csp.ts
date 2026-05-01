import { ALLOWED_THUMBNAIL_HOSTS } from '@bookhub/shared'

// thumbnailUrl のサーバー側スキーマ (packages/shared/src/schemas/book-schema.ts) は
// `hostname === h || hostname.endsWith(`.${h}`)` で exact + 全サブドメインを許可する。
// CSP img-src も同じスコープに合わせ、`https://${host}` と `https://*.${host}` の両方を出す。
// 片方だけだとサブドメイン thumbnail がスキーマでは通るのに CSP で弾かれる不一致が起きる。
const IMG_HOSTS_CSP = ALLOWED_THUMBNAIL_HOSTS.flatMap((host) => [
  `https://${host}`,
  `https://*.${host}`,
]).join(' ')

export type BuildCspOptions = {
  nonce: string
  isDev: boolean
}

// 本番 script-src は `'self' 'nonce-{nonce}' 'strict-dynamic'` で固定。`strict-dynamic` を指定する以上、
// `'self'` や URL 許可リストはブラウザに無視されるが、CSP2 互換のフォールバックとして残す
// (CSP3 非対応ブラウザは `'strict-dynamic'` を無視し、`'self'` で評価する)。
//
// dev は React Refresh runtime が eval() を使うため `'unsafe-eval'` を残す。これがないと
// HMR runtime が初期化されず client component がサイレントに動作不能になる。
//
// style-src は当面 `'unsafe-inline'` を残す。Tailwind v4 / shadcn-ui (Radix Popper 等) が動的
// inline style を出す可能性があるため (Issue #28 Phase 4 の判断、ADR は docs/specs/architecture.md
// §6.5)。将来 inline style 利用無しが確証できた時点で `'self' 'nonce-{nonce}'` への厳格化を
// 別 Issue で検討する。
export function buildContentSecurityPolicy({ nonce, isDev }: BuildCspOptions): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`

  return [
    "default-src 'self'",
    `img-src 'self' data: ${IMG_HOSTS_CSP}`,
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join('; ')
}
