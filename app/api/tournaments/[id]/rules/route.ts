import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { 
  TournamentRule, 
  SPORT_RULE_CONFIGS,
  generateDefaultRules,
  isLegacyTournament,
  getLegacyDefaultRules 
} from "@/lib/tournament-rules";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: 大会ルール取得
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

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
    
    // 既存のルール設定を取得
    const rulesResult = await db.execute(`
      SELECT * FROM t_tournament_rules 
      WHERE tournament_id = ? 
      ORDER BY phase
    `, [tournamentId]);
    
    let rules: TournamentRule[] = [];
    
    if (rulesResult.rows.length === 0) {
      // ルールが設定されていない場合、デフォルトルールを生成
      const sportTypeId = Number(tournament.sport_type_id);
      
      if (isLegacyTournament(tournamentId, sportTypeId)) {
        // 既存のPK戦大会の場合は互換性を保持
        rules = getLegacyDefaultRules(tournamentId);
      } else {
        // 新しい大会の場合は競技種別に応じたデフォルト
        try {
          rules = generateDefaultRules(tournamentId, sportTypeId);
        } catch (error) {
          console.error("デフォルトルール生成エラー:", error);
          rules = getLegacyDefaultRules(tournamentId);
        }
      }
    } else {
      // 既存ルールをマッピング
      rules = rulesResult.rows.map(row => ({
        tournament_rule_id: Number(row.tournament_rule_id),
        tournament_id: Number(row.tournament_id),
        phase: row.phase as 'preliminary' | 'final',
        use_extra_time: Boolean(row.use_extra_time),
        use_penalty: Boolean(row.use_penalty),
        active_periods: String(row.active_periods),
        win_condition: row.win_condition as 'score' | 'time' | 'points',
        notes: row.notes ? String(row.notes) : undefined,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at)
      }));
    }
    
    // 競技種別の設定情報も取得（インライン化でWebpackエラー回避）
    const sportConfig = Object.values(SPORT_RULE_CONFIGS).find(config => 
      config.sport_type_id === Number(tournament.sport_type_id)
    ) || null;
    
    return NextResponse.json({
      success: true,
      tournament: {
        tournament_id: Number(tournament.tournament_id),
        tournament_name: String(tournament.tournament_name),
        sport_type_id: Number(tournament.sport_type_id),
        sport_name: String(tournament.sport_name),
        sport_code: String(tournament.sport_code)
      },
      rules,
      sport_config: sportConfig
    });

  } catch (error) {
    console.error("大会ルール取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// PUT: 大会ルール更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const tournamentId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { rules } = body;

    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: "ルール設定が不正です" }, { status: 400 });
    }

    // 既存ルールを削除
    await db.execute(`
      DELETE FROM t_tournament_rules WHERE tournament_id = ?
    `, [tournamentId]);

    // 新しいルールを挿入
    for (const rule of rules) {
      await db.execute(`
        INSERT INTO t_tournament_rules (
          tournament_id, phase, use_extra_time, use_penalty, 
          active_periods, win_condition, notes, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        tournamentId,
        rule.phase,
        rule.use_extra_time ? 1 : 0,
        rule.use_penalty ? 1 : 0,
        rule.active_periods,
        rule.win_condition,
        rule.notes || null
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "大会ルールを更新しました"
    });

  } catch (error) {
    console.error("大会ルール更新エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// POST: デフォルトルール設定
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const session = await auth();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    const tournamentId = parseInt(resolvedParams.id);
    
    // 大会の競技種別を取得
    const tournamentResult = await db.execute(`
      SELECT sport_type_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }
    
    const sportTypeId = Number(tournamentResult.rows[0].sport_type_id);
    
    // 既存ルールを削除
    await db.execute(`
      DELETE FROM t_tournament_rules WHERE tournament_id = ?
    `, [tournamentId]);
    
    // デフォルトルールを生成・保存
    const defaultRules = generateDefaultRules(tournamentId, sportTypeId);
    
    for (const rule of defaultRules) {
      await db.execute(`
        INSERT INTO t_tournament_rules (
          tournament_id, phase, use_extra_time, use_penalty, 
          active_periods, win_condition, notes, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        rule.tournament_id,
        rule.phase,
        rule.use_extra_time ? 1 : 0,
        rule.use_penalty ? 1 : 0,
        rule.active_periods,
        rule.win_condition,
        rule.notes || null
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "デフォルトルールを設定しました",
      rules: defaultRules
    });

  } catch (error) {
    console.error("デフォルトルール設定エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}