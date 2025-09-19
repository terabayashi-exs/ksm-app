import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Node.js runtimeを明示的に指定
export const runtime = 'nodejs';

// GET: 競技種別一覧取得
export async function GET() {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const result = await db.execute(`
      SELECT 
        s.*,
        COUNT(DISTINCT f.format_id) as format_count,
        COUNT(DISTINCT t.tournament_id) as tournament_count
      FROM m_sport_types s
      LEFT JOIN m_tournament_formats f ON s.sport_type_id = f.sport_type_id
      LEFT JOIN t_tournaments t ON s.sport_type_id = t.sport_type_id
      GROUP BY s.sport_type_id
      ORDER BY s.sport_type_id
    `);

    return NextResponse.json({
      success: true,
      sportTypes: result.rows
    });

  } catch (error) {
    console.error("競技種別一覧取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// POST: 競技種別新規作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      sport_name,
      sport_code,
      score_type,
      default_match_duration,
      score_unit,
      result_format,
      period_definitions
    } = body;

    // バリデーション
    if (!sport_name || !sport_code || !period_definitions) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    // 競技コードの重複チェック
    const existingCheck = await db.execute(
      "SELECT sport_type_id FROM m_sport_types WHERE sport_code = ?",
      [sport_code]
    );

    if (existingCheck.rows.length > 0) {
      return NextResponse.json({ error: "この競技コードは既に使用されています" }, { status: 400 });
    }

    // ピリオド定義のパース
    let periodDefs;
    try {
      periodDefs = typeof period_definitions === 'string' 
        ? JSON.parse(period_definitions) 
        : period_definitions;
    } catch {
      return NextResponse.json({ error: "ピリオド定義の形式が不正です" }, { status: 400 });
    }

    // ピリオド数の自動計算
    const calculatedMaxCount = periodDefs.length;
    const calculatedRegularCount = periodDefs.filter((p: { type: string }) => p.type === 'regular').length;

    // 競技種別を作成
    const result = await db.execute(`
      INSERT INTO m_sport_types (
        sport_name, sport_code, max_period_count, regular_period_count,
        score_type, default_match_duration, score_unit, period_definitions,
        result_format, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      sport_name,
      sport_code,
      calculatedMaxCount,
      calculatedRegularCount,
      score_type || 'numeric',
      default_match_duration || 90,
      score_unit || 'ゴール',
      JSON.stringify(periodDefs),
      result_format || 'score'
    ]);

    const sportTypeId = Number(result.lastInsertRowid);

    return NextResponse.json({
      success: true,
      message: "競技種別を作成しました",
      sportType: {
        sport_type_id: sportTypeId,
        sport_name,
        sport_code
      }
    });

  } catch (error) {
    console.error("競技種別作成エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}