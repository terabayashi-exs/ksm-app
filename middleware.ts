// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { shouldApplyBasicAuth } from './lib/basic-auth-config';

// BASIC認証チェック関数
function checkBasicAuth(req: NextRequest): NextResponse | null {
  const environment = process.env.NODE_ENV || 'development';
  
  // 設定に基づいてBASIC認証適用判定
  if (!shouldApplyBasicAuth(req.nextUrl.pathname, environment)) {
    return null;
  }

  // BASIC認証の設定値
  const BASIC_AUTH_USERNAME = process.env.BASIC_AUTH_USERNAME;
  const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

  // 環境変数が設定されていない場合はBASIC認証をスキップ
  if (!BASIC_AUTH_USERNAME || !BASIC_AUTH_PASSWORD) {
    return null;
  }

  const authorization = req.headers.get('authorization');

  if (!authorization || !authorization.startsWith('Basic ')) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  const basic = authorization.split(' ')[1];
  const [username, password] = Buffer.from(basic, 'base64').toString().split(':');

  if (username !== BASIC_AUTH_USERNAME || password !== BASIC_AUTH_PASSWORD) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  return null; // 認証成功
}

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  
  // BASIC認証チェック（本番環境のみ）
  const basicAuthResponse = checkBasicAuth(req);
  if (basicAuthResponse) {
    return basicAuthResponse;
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
    "/auth/:path*"
  ]
};