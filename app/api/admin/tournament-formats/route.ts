import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Node.js runtimeを明示的に指定
export const runtime = 'nodejs';

// GET: フォーマット一覧取得
export async function GET() {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    // フォーマット一覧を取得（テンプレート数も含む）
    const result = await db.execute(`
      SELECT 
        tf.format_id,
        tf.format_name,
        tf.target_team_count,
        tf.format_description,
        tf.created_at,
        COUNT(mt.template_id) as template_count
      FROM m_tournament_formats tf
      LEFT JOIN m_match_templates mt ON tf.format_id = mt.format_id
      GROUP BY tf.format_id, tf.format_name, tf.target_team_count, tf.format_description, tf.created_at
      ORDER BY tf.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      formats: result.rows
    });

  } catch (error) {
    console.error("フォーマット一覧取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// POST: フォーマット新規作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { format_name, target_team_count, format_description, templates } = body;

    // バリデーション
    if (!format_name || !target_team_count || !Array.isArray(templates)) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    if (templates.length === 0) {
      return NextResponse.json({ error: "試合テンプレートを最低1つ作成してください" }, { status: 400 });
    }

    // フォーマット作成
    const formatResult = await db.execute(`
      INSERT INTO m_tournament_formats (format_name, target_team_count, format_description, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [format_name, target_team_count, format_description || ""]);

    const formatId = Number(formatResult.lastInsertRowid);

    // テンプレート作成
    for (const template of templates) {
      await db.execute(`
        INSERT INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, round_name, 
          block_name, team1_source, team2_source, team1_display_name, team2_display_name,
          day_number, execution_priority, court_number, suggested_start_time, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        formatId,
        template.match_number || 1,
        template.match_code,
        template.match_type || "通常",
        template.phase || "preliminary",
        template.round_name || "",
        template.block_name || "",
        template.team1_source || "",
        template.team2_source || "",
        template.team1_display_name,
        template.team2_display_name,
        template.day_number || 1,
        template.execution_priority || 1,
        template.court_number || null,
        template.suggested_start_time || null
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "フォーマットを作成しました",
      format: { format_id: formatId, format_name, target_team_count, format_description }
    });

  } catch (error) {
    console.error("フォーマット作成エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}