import { type NextRequest } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/csp/build-csp'
import { generateNonce } from '@/lib/csp/generate-nonce'
import { updateSession } from '@/lib/supabase/middleware'

const isDev = process.env.NODE_ENV === 'development'

export async function middleware(request: NextRequest) {
  // CSP nonce はリクエスト毎に再生成し、request header (x-nonce, Content-Security-Policy) と
  // response header (Content-Security-Policy) の両方に乗せる。Next.js は render 時に
  // request.headers['content-security-policy'] から nonce を抽出する (getScriptNonceFromHeader)
  // ため request 側にも CSP が必要。response 側はブラウザに対する制約。
  const nonce = generateNonce()
  const csp = buildContentSecurityPolicy({ nonce, isDev })

  // 出口で 1 回だけ CSP を set する設計にすることで、updateSession 内の next/redirect/json 全
  // 経路 (Bearer pass-through 含む) に CSP が漏れなく付与される。CSP 注入と認証 Cookie 同期の
  // 責務をオーケストレータ層で分離する。
  const response = await updateSession(request, { nonce, csp })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
}
