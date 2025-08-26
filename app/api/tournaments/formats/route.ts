import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "管理者権限が必要です" },
        { status: 401 }
      );
    }

    // 大会フォーマット一覧を取得
    const formatsResult = await db.execute(`
      SELECT 
        format_id,
        format_name,
        target_team_count,
        format_description,
        created_at
      FROM m_tournament_formats
      ORDER BY target_team_count, format_name
    `);

    // 各フォーマットの試合テンプレート数も取得
    const formatsWithCounts = [];
    
    for (const format of formatsResult.rows) {
      const templateCountResult = await db.execute(`
        SELECT COUNT(*) as template_count
        FROM m_match_templates
        WHERE format_id = ?
      `, [format.format_id]);
      
      const templateCount = templateCountResult.rows[0]?.template_count || 0;
      
      formatsWithCounts.push({
        ...format,
        template_count: templateCount
      });
    }

    return NextResponse.json({
      success: true,
      formats: formatsWithCounts
    });

  } catch (error) {
    console.error("フォーマット取得エラー:", error);
    return NextResponse.json(
      { success: false, error: "フォーマット情報の取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}