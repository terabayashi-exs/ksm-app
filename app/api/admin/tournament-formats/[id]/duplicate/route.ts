import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST: フォーマット複製
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const sourceFormatId = parseInt(resolvedParams.id);

    // 元フォーマット情報取得
    const formatResult = await db.execute(`
      SELECT * FROM m_tournament_formats WHERE format_id = ?
    `, [sourceFormatId]);

    if (formatResult.rows.length === 0) {
      return NextResponse.json({ error: "複製元フォーマットが見つかりません" }, { status: 404 });
    }

    const sourceFormat = formatResult.rows[0];

    // 元テンプレート情報取得
    const templatesResult = await db.execute(`
      SELECT * FROM m_match_templates 
      WHERE format_id = ? 
      ORDER BY match_number
    `, [sourceFormatId]);

    // 新フォーマット名を生成
    const newFormatName = `${sourceFormat.format_name} のコピー`;

    // 新フォーマット作成
    const newFormatResult = await db.execute(`
      INSERT INTO m_tournament_formats (format_name, target_team_count, format_description, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [newFormatName, sourceFormat.target_team_count, sourceFormat.format_description]);

    const newFormatId = Number(newFormatResult.lastInsertRowid);

    // テンプレートを複製
    for (const template of templatesResult.rows) {
      await db.execute(`
        INSERT INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, round_name,
          block_name, team1_source, team2_source, team1_display_name, team2_display_name,
          day_number, execution_priority, court_number, suggested_start_time,
          loser_position_start, loser_position_end, winner_position, position_note,
          is_bye_match, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        newFormatId,
        template.match_number,
        template.match_code,
        template.match_type,
        template.phase,
        template.round_name,
        template.block_name,
        template.team1_source,
        template.team2_source,
        template.team1_display_name,
        template.team2_display_name,
        template.day_number,
        template.execution_priority,
        template.court_number,
        template.suggested_start_time,
        template.loser_position_start || null,
        template.loser_position_end || null,
        template.winner_position || null,
        template.position_note || null,
        template.is_bye_match || 0
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "フォーマットを複製しました",
      newFormat: {
        format_id: newFormatId,
        format_name: newFormatName,
        target_team_count: sourceFormat.target_team_count,
        format_description: sourceFormat.format_description
      }
    });

  } catch (error) {
    console.error("フォーマット複製エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}