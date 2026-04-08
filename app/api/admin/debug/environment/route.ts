// app/api/admin/debug/environment/route.ts
// 環境変数デバッグAPI（本番では使用禁止）

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(_request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    // 本番環境では無効化
    if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "本番環境では利用できません" },
        { status: 403 },
      );
    }

    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "UNSET",
      DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN ? "SET" : "UNSET",

      // Blob Storage 関連
      DEV_BLOB_READ_WRITE_TOKEN: process.env.DEV_BLOB_READ_WRITE_TOKEN
        ? `SET (${process.env.DEV_BLOB_READ_WRITE_TOKEN?.substring(0, 20)}...)`
        : "UNSET",
      PROD_BLOB_READ_WRITE_TOKEN: process.env.PROD_BLOB_READ_WRITE_TOKEN
        ? `SET (${process.env.PROD_BLOB_READ_WRITE_TOKEN?.substring(0, 20)}...)`
        : "UNSET",
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN
        ? `SET (${process.env.BLOB_READ_WRITE_TOKEN?.substring(0, 20)}...)`
        : "UNSET",

      // Next.js 関連
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "UNSET",
    };

    console.log("🌍 環境変数デバッグ情報:", envInfo);

    return NextResponse.json({
      success: true,
      environment: envInfo,
    });
  } catch (error) {
    console.error("❌ 環境変数チェックエラー:", error);
    return NextResponse.json(
      { success: false, error: "環境変数チェックに失敗しました" },
      { status: 500 },
    );
  }
}
