import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: 個別フォーマット詳細取得
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const formatId = parseInt(resolvedParams.id);
    
    // フォーマット情報取得（競技種別も含む）
    const formatResult = await db.execute(`
      SELECT 
        tf.*,
        st.sport_name,
        st.sport_code
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      WHERE tf.format_id = ?
    `, [formatId]);

    if (formatResult.rows.length === 0) {
      return NextResponse.json({ error: "フォーマットが見つかりません" }, { status: 404 });
    }

    // テンプレート情報取得
    const templatesResult = await db.execute(`
      SELECT * FROM m_match_templates 
      WHERE format_id = ? 
      ORDER BY execution_priority, match_number
    `, [formatId]);

    return NextResponse.json({
      success: true,
      format: formatResult.rows[0],
      templates: templatesResult.rows
    });

  } catch (error) {
    console.error("フォーマット詳細取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// PUT: フォーマット更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const formatId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { format_name, sport_type_id, target_team_count, format_description, preliminary_format_type, final_format_type, templates } = body;

    // バリデーション
    if (!format_name || !sport_type_id || !target_team_count || !Array.isArray(templates)) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    if (templates.length === 0) {
      return NextResponse.json({ error: "試合テンプレートを最低1つ作成してください" }, { status: 400 });
    }

    // フォーマット更新
    await db.execute(`
      UPDATE m_tournament_formats
      SET format_name = ?, sport_type_id = ?, target_team_count = ?, format_description = ?, preliminary_format_type = ?, final_format_type = ?, updated_at = datetime('now', '+9 hours')
      WHERE format_id = ?
    `, [format_name, sport_type_id, target_team_count, format_description || "", preliminary_format_type || null, final_format_type || null, formatId]);

    // 既存テンプレートを削除
    await db.execute(`
      DELETE FROM m_match_templates WHERE format_id = ?
    `, [formatId]);

    // 新しいテンプレートを作成
    for (const template of templates) {
      await db.execute(`
        INSERT INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, round_name, 
          block_name, team1_source, team2_source, team1_display_name, team2_display_name,
          day_number, execution_priority, court_number, suggested_start_time, 
          loser_position_start, loser_position_end, winner_position, position_note,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
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
        template.suggested_start_time || null,
        // 新しい順位設定フィールド
        template.loser_position_start || null,
        template.loser_position_end || null,
        template.winner_position || null,
        template.position_note || null
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "フォーマットを更新しました"
    });

  } catch (error) {
    console.error("フォーマット更新エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// DELETE: フォーマット削除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const formatId = parseInt(resolvedParams.id);

    // 既存の大会で使用されているかチェック
    const usageCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments WHERE format_id = ?
    `, [formatId]);

    if (Number(usageCheck.rows[0].count) > 0) {
      return NextResponse.json({ 
        error: "このフォーマットは既存の大会で使用されているため削除できません" 
      }, { status: 400 });
    }

    // テンプレートを削除
    await db.execute(`
      DELETE FROM m_match_templates WHERE format_id = ?
    `, [formatId]);

    // フォーマットを削除
    await db.execute(`
      DELETE FROM m_tournament_formats WHERE format_id = ?
    `, [formatId]);

    return NextResponse.json({
      success: true,
      message: "フォーマットを削除しました"
    });

  } catch (error) {
    console.error("フォーマット削除エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}