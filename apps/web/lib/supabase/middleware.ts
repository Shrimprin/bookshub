import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/signup']

export type UpdateSessionOptions = {
  /**
   * CSP nonce。指定された場合、`NextResponse.next()` 経路すべてに `x-nonce` request header
   * を付与し、Next.js が RSC ハイドレーションスクリプトに自動で nonce を埋め込めるようにする。
   * リダイレクト/JSON 経路ではブラウザに到達するレスポンス自体には影響せず、CSP ヘッダ自身は
   * 呼び出し側 (middleware オーケストレータ) が response.headers に set する。
   */
  nonce?: string
}

export async function updateSession(request: NextRequest, options: UpdateSessionOptions = {}) {
  const { nonce } = options

  // setAll コールバックは Supabase が refresh した cookie を request.cookies へ反映する。
  // request.cookies の変更は request.headers にも同期するため、x-nonce を載せた snapshot は
  // setAll 呼び出しごとに作り直す必要がある (古い snapshot を使うと cookie 更新が失われる)。
  const buildNextOptions = () => {
    if (!nonce) return { request }
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    return { request: { headers } }
  }

  let supabaseResponse = NextResponse.next(buildNextOptions())

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next(buildNextOptions())
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { pathname } = request.nextUrl
  const isApiPath = pathname.startsWith('/api/')

  // Bearer トークン認証 API: Route Handler 側で認証するため、ミドルウェアの Cookie 認証をスキップ
  // 新しい Bearer 認証 API を追加する場合はここにパスを追加すること
  // TODO: 本番デプロイ前に Cloudflare WAF でエンドポイント毎のレート制限を設定すること
  const BEARER_AUTH_PATHS = ['/api/scrape', '/api/books']
  const hasBearerToken = request.headers.get('authorization')?.startsWith('Bearer ')
  if (
    hasBearerToken &&
    BEARER_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))
  ) {
    return NextResponse.next(buildNextOptions())
  }

  // CRITICAL: getSession() はサーバーサイドで信頼不可。必ず getUser() を使うこと
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth/')

  // 未認証 + 保護対象ルート
  if (!user && !isPublicPath) {
    if (isApiPath) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
      return response
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  // 認証済みユーザーが /login or /signup にアクセスした場合は bookshelf へ
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/bookshelf'
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  return supabaseResponse
}
