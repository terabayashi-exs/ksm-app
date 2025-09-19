import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = 'nodejs';

// GET: 競技種別一覧取得（大会作成時に使用）
export async function GET() {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const result = await db.execute(`
      SELECT 
        sport_type_id,
        sport_name,
        sport_code,
        max_period_count,
        regular_period_count,
        score_type,
        default_match_duration,
        score_unit,
        period_definitions,
        result_format
      FROM m_sport_types
      ORDER BY sport_type_id
    `);

    return NextResponse.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error("競技種別一覧取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}