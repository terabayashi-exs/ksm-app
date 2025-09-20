// app/api/tournaments/[id]/tie-breaking-rules/route.ts
// 順位決定ルールの取得・更新API

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { 
  TieBreakingRule,
  getAvailableTieBreakingRules,
  getDefaultTieBreakingRules,
  validateTieBreakingRules,
  parseTieBreakingRules,
  stringifyTieBreakingRules
} from "@/lib/tie-breaking-rules";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET: 順位決定ルール取得
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);
    
    // 大会情報を取得（競技種別を含む）
    const tournamentResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.sport_type_id,
        st.sport_name,
        st.sport_code
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    
    const tournament = tournamentResult.rows[0];
    const sportCode = String(tournament.sport_code || 'pk_championship');
    
    // 既存の順位決定ルール設定を取得
    const rulesResult = await db.execute(`
      SELECT 
        tournament_rule_id,
        phase,
        tie_breaking_rules,
        tie_breaking_enabled
      FROM t_tournament_rules 
      WHERE tournament_id = ? 
      ORDER BY phase
    `, [tournamentId]);
    
    const response: Record<string, unknown> = {
      success: true,
      tournament: {
        tournament_id: Number(tournament.tournament_id),
        tournament_name: String(tournament.tournament_name),
        sport_type_id: Number(tournament.sport_type_id),
        sport_name: String(tournament.sport_name || ''),
        sport_code: sportCode
      },
      available_rule_types: getAvailableTieBreakingRules(sportCode),
      default_rules: getDefaultTieBreakingRules(sportCode)
    };

    // フェーズ別の順位決定ルール
    const phaseRules: Record<string, unknown> = {};
    
    for (const row of rulesResult.rows) {
      const phase = String(row.phase);
      const rulesJson = row.tie_breaking_rules ? String(row.tie_breaking_rules) : null;
      const enabled = Boolean(row.tie_breaking_enabled);
      
      let rules: TieBreakingRule[] = [];
      
      if (rulesJson && enabled) {
        rules = parseTieBreakingRules(rulesJson);
      }
      
      // ルールが設定されていない場合はデフォルトを提示
      if (rules.length === 0) {
        rules = getDefaultTieBreakingRules(sportCode);
      }
      
      phaseRules[phase] = {
        tournament_rule_id: Number(row.tournament_rule_id),
        enabled,
        rules
      };
    }

    response.phase_rules = phaseRules;
    
    return NextResponse.json(response);

  } catch (error) {
    console.error("順位決定ルール取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// PUT: 順位決定ルール更新
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { phase, rules, enabled } = body;

    if (!['preliminary', 'final'].includes(phase)) {
      return NextResponse.json({ error: "無効なフェーズです" }, { status: 400 });
    }

    // 大会の競技種別を取得
    const tournamentResult = await db.execute(`
      SELECT 
        st.sport_code
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    
    const sportCode = String(tournamentResult.rows[0].sport_code || 'pk_championship');

    // ルールのバリデーション
    if (enabled && Array.isArray(rules)) {
      const validation = validateTieBreakingRules(rules, sportCode);
      if (!validation.isValid) {
        return NextResponse.json({ 
          error: "順位決定ルールが無効です", 
          details: validation.errors 
        }, { status: 400 });
      }
    }

    // 既存の設定を確認
    const existingResult = await db.execute(`
      SELECT tournament_rule_id FROM t_tournament_rules 
      WHERE tournament_id = ? AND phase = ?
    `, [tournamentId, phase]);

    const rulesJson = enabled && Array.isArray(rules) ? stringifyTieBreakingRules(rules) : null;
    const enabledFlag = enabled ? 1 : 0;

    if (existingResult.rows.length > 0) {
      // 既存レコードを更新
      await db.execute(`
        UPDATE t_tournament_rules 
        SET 
          tie_breaking_rules = ?,
          tie_breaking_enabled = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_id = ? AND phase = ?
      `, [rulesJson, enabledFlag, tournamentId, phase]);
    } else {
      // 新規レコードを作成（基本的なルール設定も含む）
      const defaultRuleConfig = phase === 'preliminary' 
        ? { use_extra_time: 0, use_penalty: 0, active_periods: '["1"]', win_condition: 'score' }
        : { use_extra_time: 0, use_penalty: 0, active_periods: '["1"]', win_condition: 'score' };

      await db.execute(`
        INSERT INTO t_tournament_rules (
          tournament_id, phase, use_extra_time, use_penalty, 
          active_periods, win_condition, tie_breaking_rules, tie_breaking_enabled,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        tournamentId, phase, 
        defaultRuleConfig.use_extra_time,
        defaultRuleConfig.use_penalty,
        defaultRuleConfig.active_periods,
        defaultRuleConfig.win_condition,
        rulesJson, enabledFlag
      ]);
    }

    return NextResponse.json({
      success: true,
      message: `${phase === 'preliminary' ? '予選' : '決勝'}の順位決定ルールを更新しました`,
      phase,
      enabled: enabled,
      rules: enabled && Array.isArray(rules) ? rules : []
    });

  } catch (error) {
    console.error("順位決定ルール更新エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// POST: デフォルト順位決定ルール設定
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);
    
    // 大会の競技種別を取得
    const tournamentResult = await db.execute(`
      SELECT 
        st.sport_code
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    
    const sportCode = String(tournamentResult.rows[0].sport_code || 'pk_championship');
    const defaultRules = getDefaultTieBreakingRules(sportCode);
    const rulesJson = stringifyTieBreakingRules(defaultRules);
    
    // 既存の順位決定ルール設定を削除
    await db.execute(`
      UPDATE t_tournament_rules 
      SET 
        tie_breaking_rules = ?,
        tie_breaking_enabled = 1,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [rulesJson, tournamentId]);

    return NextResponse.json({
      success: true,
      message: "デフォルトの順位決定ルールを設定しました",
      sport_code: sportCode,
      rules: defaultRules
    });

  } catch (error) {
    console.error("デフォルト順位決定ルール設定エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}