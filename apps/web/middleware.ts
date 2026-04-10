import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // TODO: Supabase Auth セッション更新・ルート保護を実装 (#4)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
