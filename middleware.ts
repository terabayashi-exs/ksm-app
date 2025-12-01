// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // 審判用ルート（/referee/*）は認証不要で通過させる
  const isRefereeRoute = nextUrl.pathname.startsWith("/referee");
  if (isRefereeRoute) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isLoggedIn = !!token;
  const userRole = token?.role;

  // Edge browser localStorage fix headers
  const response = NextResponse.next();
  const userAgent = req.headers.get('user-agent') || '';

  if (userAgent.includes('Edg') && process.env.NODE_ENV === 'development') {
    response.headers.set('X-Edge-Fix', 'true');
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // 認証が必要なルートの定義
  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isTeamRoute = nextUrl.pathname.startsWith("/team");
  const isAuthRoute = nextUrl.pathname.startsWith("/auth");

  // 既にログイン済みの場合、認証ページにアクセスしようとしたらリダイレクト
  if (isLoggedIn && isAuthRoute) {
    if (userRole === "admin") {
      return NextResponse.redirect(new URL("/admin", nextUrl));
    } else if (userRole === "team") {
      return NextResponse.redirect(new URL("/team", nextUrl));
    }
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  // 管理者ルートの保護
  if (isAdminRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${nextUrl.pathname}`, nextUrl)
      );
    }
    if (userRole !== "admin") {
      return NextResponse.redirect(new URL("/auth/login", nextUrl));
    }
  }

  // チームルートの保護
  if (isTeamRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${nextUrl.pathname}`, nextUrl)
      );
    }
    if (userRole !== "team") {
      return NextResponse.redirect(new URL("/auth/login", nextUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 認証が必要なルートを指定
    "/admin/:path*",
    "/team/:path*",
    "/auth/:path*",
    // 審判ルートも明示的に追加（middlewareで除外処理を行う）
    "/referee/:path*"
  ]
};