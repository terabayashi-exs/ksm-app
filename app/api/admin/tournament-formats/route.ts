import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateMatchTeams, isByeMatchToNumber } from "@/lib/bye-match-utils";

// Node.js runtimeを明示的に指定
export const runtime = 'nodejs';

// GET: フォーマット一覧取得
export async function GET() {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    // フォーマット一覧を取得（競技種別・テンプレート数も含む）
    const result = await db.execute(`
      SELECT
        tf.format_id,
        tf.format_name,
        tf.sport_type_id,
        tf.target_team_count,
        tf.format_description,
        tf.default_match_duration,
        tf.default_break_duration,
        tf.phases,
        tf.visibility,
        tf.created_at,
        st.sport_name,
        st.sport_code,
        COUNT(mt.template_id) as template_count,
        COUNT(DISTINCT mt.matchday) as matchday_count,
        COUNT(DISTINCT mt.block_name) as block_count,
        MAX(mt.court_number) as max_court_number
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      LEFT JOIN m_match_templates mt ON tf.format_id = mt.format_id
      GROUP BY tf.format_id, tf.format_name, tf.sport_type_id, tf.target_team_count, tf.format_description, tf.default_match_duration, tf.default_break_duration, tf.phases, tf.visibility, tf.created_at, st.sport_name, st.sport_code
      ORDER BY tf.created_at DESC
    `);

    // フェーズごとのブロック数・コート数を取得
    const phaseStatsResult = await db.execute(`
      SELECT
        mt.format_id,
        mt.phase,
        COUNT(DISTINCT mt.block_name) as block_count,
        MAX(mt.court_number) as max_court_number
      FROM m_match_templates mt
      GROUP BY mt.format_id, mt.phase
      ORDER BY mt.format_id, mt.phase
    `);

    // フォーマットごとにフェーズ統計をマッピング
    const phaseStatsMap = new Map<number, Array<{ phase: string; block_count: number; max_court_number: number | null }>>();
    for (const row of phaseStatsResult.rows) {
      const formatId = Number(row.format_id);
      if (!phaseStatsMap.has(formatId)) {
        phaseStatsMap.set(formatId, []);
      }
      phaseStatsMap.get(formatId)!.push({
        phase: String(row.phase || ''),
        block_count: Number(row.block_count || 0),
        max_court_number: row.max_court_number != null ? Number(row.max_court_number) : null,
      });
    }

    // フォーマットにフェーズ統計を追加（phases JSONからフェーズ名・orderを解決）
    const formatsWithPhaseStats = result.rows.map(format => {
      const rawStats = phaseStatsMap.get(Number(format.format_id)) || [];

      // phases JSONをパースしてフェーズ名・order情報を取得
      const phaseLookup: Record<string, { name: string; order: number }> = {};
      if (format.phases) {
        try {
          const parsed = JSON.parse(String(format.phases));
          if (parsed?.phases && Array.isArray(parsed.phases)) {
            for (const p of parsed.phases) {
              phaseLookup[p.id] = { name: p.name || p.id, order: p.order ?? 0 };
            }
          }
        } catch { /* ignore */ }
      }

      // phase_statsにフェーズ名・orderを付与し、order順にソート
      const phaseStats = rawStats
        .map(ps => ({
          ...ps,
          phase_name: phaseLookup[ps.phase]?.name || ps.phase,
          order: phaseLookup[ps.phase]?.order ?? 999,
        }))
        .sort((a, b) => a.order - b.order);

      return {
        ...format,
        phase_stats: phaseStats,
      };
    });

    return NextResponse.json({
      success: true,
      formats: formatsWithPhaseStats
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

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { format_name, sport_type_id, target_team_count, format_description, default_match_duration, default_break_duration, phases, templates } = body;

    // バリデーション
    if (!format_name || !sport_type_id || !target_team_count || !Array.isArray(templates)) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    if (templates.length === 0) {
      return NextResponse.json({ error: "試合テンプレートを最低1つ作成してください" }, { status: 400 });
    }

    // テンプレートのフェーズバリデーション
    if (phases?.phases) {
      const validPhaseIds = new Set(phases.phases.map((p: { id: string }) => p.id));
      const invalidTemplates = templates.filter((t: { phase?: string; match_number?: number; match_code?: string }) => !t.phase || !validPhaseIds.has(t.phase));
      if (invalidTemplates.length > 0) {
        const details = invalidTemplates.map((t: { match_number?: number; match_code?: string }) => `試合No.${t.match_number}（${t.match_code}）`).join('、');
        return NextResponse.json({ error: `以下の試合でフェーズが未選択です: ${details}` }, { status: 400 });
      }
    }

    // フォーマット作成
    const formatResult = await db.execute(`
      INSERT INTO m_tournament_formats (format_name, sport_type_id, target_team_count, format_description, default_match_duration, default_break_duration, phases, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [format_name, sport_type_id, target_team_count, format_description || "", default_match_duration ?? null, default_break_duration ?? null, phases ? JSON.stringify(phases) : null]);

    const formatId = Number(formatResult.lastInsertRowid);

    // テンプレート作成
    for (const template of templates) {
      // バリデーション
      const validation = validateMatchTeams(template.team1_display_name, template.team2_display_name, template.match_type);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // is_bye_match を自動計算
      const isByeMatch = isByeMatchToNumber(validation.isByeMatch);

      // 不戦勝試合の場合、コート番号はNULL
      const courtNumber = validation.isByeMatch ? null : (template.court_number || null);

      await db.execute(`
        INSERT INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, round_name,
          block_name, team1_source, team2_source, team1_display_name, team2_display_name,
          day_number, execution_priority, court_number, suggested_start_time,
          loser_position_start, loser_position_end, winner_position, position_note,
          is_bye_match, matchday, cycle,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
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
        template.team1_display_name || "",  // 空文字列を使用
        template.team2_display_name || "",  // 空文字列を使用
        template.day_number || 1,
        template.execution_priority || 1,
        courtNumber,
        template.suggested_start_time || null,
        // 新しい順位設定フィールド
        template.loser_position_start || null,
        template.loser_position_end || null,
        template.winner_position || null,
        template.position_note || null,
        isByeMatch,
        // リーグ戦対応フィールド
        template.matchday || null,
        template.cycle || null
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "フォーマットを作成しました",
      format: { format_id: formatId, format_name, sport_type_id, target_team_count, format_description }
    });

  } catch (error) {
    console.error("フォーマット作成エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}