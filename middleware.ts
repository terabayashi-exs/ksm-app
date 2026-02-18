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

  // roles 配列（新設計）と role（後方互換）の両方に対応
  const roles: string[] = Array.isArray(token?.roles) ? token.roles : [];
  const userRole = token?.role as string | undefined;

  const hasAdminAccess = roles.includes("admin") || roles.includes("operator")
    || userRole === "admin" || userRole === "operator";
  const hasTeamAccess = roles.includes("team") || userRole === "team";

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
  const isMyRoute = nextUrl.pathname.startsWith("/my");
  const isAuthRoute = nextUrl.pathname.startsWith("/auth");

  // 既にログイン済みの場合、認証ページにアクセスしようとしたらリダイレクト
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/my", nextUrl));
  }

  // 管理者・運営者ルートの保護
  if (isAdminRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${nextUrl.pathname}`, nextUrl)
      );
    }
    if (!hasAdminAccess) {
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
    if (!hasTeamAccess) {
      return NextResponse.redirect(new URL("/auth/login", nextUrl));
    }
  }

  // マイダッシュボードの保護（ログイン済みであれば全ロール可）
  if (isMyRoute) {
    if (!isLoggedIn) {
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${nextUrl.pathname}`, nextUrl)
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 認証が必要なルートを指定
    "/admin/:path*",
    "/team/:path*",
    "/my/:path*",
    "/my",
    "/auth/:path*",
    // 審判ルートも明示的に追加（middlewareで除外処理を行う）
    "/referee/:path*"
  ]
};
