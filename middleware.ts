// middleware.ts

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // 旧システムURL（/tournaments）→ トップページへ301リダイレクト（クエリパラメータ除外）
  if (nextUrl.pathname === "/tournaments") {
    return NextResponse.redirect(new URL("/", nextUrl), 301);
  }

  // 審判用ルート（/referee/*）は認証不要で通過させる
  const isRefereeRoute = nextUrl.pathname.startsWith("/referee");
  // 新QR結果入力ルート（/tournament/[id]/match/[id]/result）も認証不要
  const isTournamentResultRoute = /^\/tournament\/\d+\/match\/\d+\/result/.test(nextUrl.pathname);
  if (isRefereeRoute || isTournamentResultRoute) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isLoggedIn = !!token;

  // roles 配列（新設計）と role（後方互換）の両方に対応
  const roles: string[] = Array.isArray(token?.roles) ? token.roles : [];
  const userRole = token?.role as string | undefined;

  const hasAdminAccess =
    roles.includes("admin") ||
    roles.includes("operator") ||
    userRole === "admin" ||
    userRole === "operator";
  // Edge browser localStorage fix headers
  const response = NextResponse.next();
  const userAgent = req.headers.get("user-agent") || "";

  if (userAgent.includes("Edg") && process.env.NODE_ENV === "development") {
    response.headers.set("X-Edge-Fix", "true");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }

  // 認証が必要なルートの定義
  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  const isMyRoute = nextUrl.pathname.startsWith("/my");
  const isAuthRoute = nextUrl.pathname.startsWith("/auth");

  // 既にログイン済みの場合、認証ページにアクセスしようとしたらリダイレクト
  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/my", nextUrl));
  }

  // 管理者・運営者ルートの保護
  if (isAdminRoute) {
    if (!isLoggedIn) {
      // パスとクエリパラメータの両方を保持
      const fullPath = nextUrl.pathname + nextUrl.search;
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${encodeURIComponent(fullPath)}`, nextUrl),
      );
    }
    if (!hasAdminAccess) {
      return NextResponse.redirect(new URL("/auth/login", nextUrl));
    }
  }

  // マイダッシュボードの保護（ログイン済みであれば全ロール可）
  if (isMyRoute) {
    if (!isLoggedIn) {
      // パスとクエリパラメータの両方を保持
      const fullPath = nextUrl.pathname + nextUrl.search;
      return NextResponse.redirect(
        new URL(`/auth/login?callbackUrl=${encodeURIComponent(fullPath)}`, nextUrl),
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 認証が必要なルートを指定
    "/admin/:path*",
    "/my/:path*",
    "/my",
    "/auth/:path*",
    // 審判ルート・QR結果入力ルートも明示的に追加（middlewareで除外処理を行う）
    "/referee/:path*",
    "/tournament/:path*",
    // 旧システムURLのリダイレクト
    "/tournaments",
  ],
};
