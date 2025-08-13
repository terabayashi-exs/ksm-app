// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const isLoggedIn = !!session?.user;
  const userRole = session?.user?.role;

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
});

export const config = {
  matcher: [
    // 認証が必要なルートを指定
    "/admin/:path*",
    "/team/:path*",
    "/auth/:path*"
  ]
};