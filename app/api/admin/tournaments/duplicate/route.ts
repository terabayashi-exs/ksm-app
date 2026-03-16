// app/api/admin/tournaments/duplicate/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';
import { canCreateTournamentGroup } from '@/lib/subscription/plan-checker';
import { recalculateUsage } from '@/lib/subscription/subscription-service';

interface DuplicateRequest {
  source_tournament_id: number;
  new_tournament_name: string;
  group_id?: number;
  new_group?: {
    group_name: string;
    organizer?: string;
    event_start_date?: string;
    event_end_date?: string;
  };
  is_public: boolean;
  show_players_public: boolean;
  public_start_date: string;
  recruitment_start_date: string;
  recruitment_end_date: string;
  tournament_dates?: string; // JSON: {"1":"2026-05-01",...}
  event_start_date?: string;
  event_end_date?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const body: DuplicateRequest = await request.json();
    const {
      source_tournament_id, new_tournament_name, group_id, new_group,
      is_public, show_players_public,
      public_start_date, recruitment_start_date, recruitment_end_date,
      tournament_dates, event_start_date, event_end_date,
    } = body;

    if (!source_tournament_id || !new_tournament_name?.trim()) {
      return NextResponse.json(
        { success: false, error: '複製元の部門IDと新しい部門名は必須です' },
        { status: 400 }
      );
    }

    if (!group_id && !new_group) {
      return NextResponse.json(
        { success: false, error: '複製先の大会（既存または新規）を指定してください' },
        { status: 400 }
      );
    }

    if (new_group && !new_group.group_name?.trim()) {
      return NextResponse.json(
        { success: false, error: '新規大会名は必須です' },
        { status: 400 }
      );
    }

    // 複製元大会の存在確認
    const sourceTournament = await db.execute(`
      SELECT t.*, st.sport_code, st.sport_name
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [source_tournament_id]);

    if (sourceTournament.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '複製元の部門が見つかりません' },
        { status: 404 }
      );
    }

    const sourceData = sourceTournament.rows[0] as any;
    if (sourceData.is_archived === 1) {
      return NextResponse.json(
        { success: false, error: 'アーカイブ済みの部門は複製できません' },
        { status: 400 }
      );
    }

    // 部門名の重複チェック
    const nameCheck = await db.execute(`
      SELECT tournament_id FROM t_tournaments WHERE tournament_name = ?
    `, [new_tournament_name.trim()]);

    if (nameCheck.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'この部門名は既に使用されています' },
        { status: 400 }
      );
    }

    // 複製先グループIDを決定
    let targetGroupId: number;

    if (new_group) {
      // 新規大会グループ作成
      const planCheck = await canCreateTournamentGroup(session.user.id);
      if (!planCheck.allowed) {
        return NextResponse.json(
          { success: false, error: planCheck.reason, planLimitExceeded: true },
          { status: 403 }
        );
      }

      // login_user_id を解決
      let resolvedLoginUserId: number | null = null;
      let resolvedAdminLoginId: string | null = null;
      const parsedId = Number(session.user.id);

      if (!isNaN(parsedId) && parsedId > 0) {
        resolvedLoginUserId = parsedId;
        const adminResult = await db.execute(
          `SELECT a.admin_login_id FROM m_administrators a
           INNER JOIN m_login_users u ON a.email = u.email
           WHERE u.login_user_id = ? LIMIT 1`,
          [parsedId]
        );
        resolvedAdminLoginId = adminResult.rows.length > 0
          ? String(adminResult.rows[0].admin_login_id)
          : null;
      } else {
        resolvedAdminLoginId = session.user.id;
        const userResult = await db.execute(
          `SELECT u.login_user_id FROM m_login_users u
           INNER JOIN m_administrators a ON a.email = u.email
           WHERE a.admin_login_id = ? LIMIT 1`,
          [session.user.id]
        );
        resolvedLoginUserId = userResult.rows.length > 0
          ? Number(userResult.rows[0].login_user_id)
          : null;
      }

      const groupResult = await db.execute(`
        INSERT INTO t_tournament_groups (
          group_name, organizer, event_start_date, event_end_date,
          visibility, admin_login_id, login_user_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `, [
        new_group.group_name.trim(),
        new_group.organizer || null,
        new_group.event_start_date || event_start_date || null,
        new_group.event_end_date || event_end_date || null,
        'open',
        resolvedAdminLoginId,
        resolvedLoginUserId,
      ]);

      targetGroupId = Number(groupResult.lastInsertRowid);
      console.log(`[DUPLICATE] 新規大会グループ作成: ID=${targetGroupId}, 名前=${new_group.group_name}`);

      await recalculateUsage(session.user.id);
    } else {
      // 既存大会グループに追加
      const groupCheck = await db.execute(`
        SELECT group_id FROM t_tournament_groups WHERE group_id = ?
      `, [group_id!]);

      if (groupCheck.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '指定された大会グループが見つかりません' },
          { status: 404 }
        );
      }

      targetGroupId = group_id!;
    }

    // 複製実行（基本情報 + ルールのみ）
    const newTournamentId = await duplicateTournamentBasic(
      source_tournament_id,
      new_tournament_name.trim(),
      session.user.id,
      targetGroupId,
      {
        is_public,
        show_players_public,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        tournament_dates: tournament_dates || null,
        event_start_date: event_start_date || null,
        event_end_date: event_end_date || null,
      }
    );

    await duplicateTournamentRules(source_tournament_id, newTournamentId);

    console.log(`[DUPLICATE] 複製完了: 大会${source_tournament_id} -> 新部門${newTournamentId} (グループ${targetGroupId})`);

    return NextResponse.json({
      success: true,
      message: '部門の複製が完了しました',
      details: {
        original_tournament_id: source_tournament_id,
        new_tournament_id: newTournamentId,
        new_tournament_name: new_tournament_name.trim(),
        group_id: targetGroupId,
        new_group_created: !!new_group,
      }
    });

  } catch (error) {
    console.error('[DUPLICATE] エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '複製処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

interface DuplicateOptions {
  is_public: boolean;
  show_players_public: boolean;
  public_start_date: string;
  recruitment_start_date: string;
  recruitment_end_date: string;
  tournament_dates: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
}

/**
 * 大会基本情報の複製（基本情報のみ）
 */
async function duplicateTournamentBasic(
  sourceTournamentId: number,
  newTournamentName: string,
  createdBy: string,
  groupId: number,
  options: DuplicateOptions,
): Promise<number> {
  const sourceResult = await db.execute(`
    SELECT * FROM t_tournaments WHERE tournament_id = ?
  `, [sourceTournamentId]);

  if (sourceResult.rows.length === 0) {
    throw new Error('複製元の部門が見つかりません');
  }

  const sourceData = sourceResult.rows[0] as any;
  const currentArchiveVersion = ArchiveVersionManager.getCurrentVersion();

  // tournament_dates: ユーザー指定があればそれを使用、なければソースからコピー
  const tournamentDates = options.tournament_dates || sourceData.tournament_dates || null;

  // visibility: is_public から決定
  const visibility = options.is_public ? 'open' : 'preparing';

  const insertResult = await db.execute(`
    INSERT INTO t_tournaments (
      tournament_name, format_id, format_name, venue_id, team_count,
      recruitment_start_date, recruitment_end_date, tournament_dates,
      status, visibility, public_start_date, court_count, match_duration_minutes, break_duration_minutes,
      sport_type_id, show_players_public, phases,
      created_by, archive_ui_version, group_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
  `, [
    newTournamentName,
    sourceData.format_id || 1,
    sourceData.format_name || null,
    sourceData.venue_id || null,
    sourceData.team_count || 0,
    options.recruitment_start_date || null,
    options.recruitment_end_date || null,
    tournamentDates,
    'planning', // 常にplanning
    visibility,
    options.public_start_date || null,
    sourceData.court_count || 4,
    sourceData.match_duration_minutes || 15,
    sourceData.break_duration_minutes || 5,
    sourceData.sport_type_id || 1,
    options.show_players_public ? 1 : 0,
    sourceData.phases || null,
    createdBy,
    currentArchiveVersion,
    groupId,
  ]);

  return Number(insertResult.lastInsertRowid);
}

/**
 * ルール情報の複製
 */
async function duplicateTournamentRules(sourceTournamentId: number, newTournamentId: number): Promise<void> {
  const rulesResult = await db.execute(`
    SELECT * FROM t_tournament_rules WHERE tournament_id = ?
  `, [sourceTournamentId]);

  if (rulesResult.rows.length === 0) {
    console.log(`[DUPLICATE] 警告: 大会${sourceTournamentId}にルールデータが存在しません`);
    return;
  }

  for (const rule of rulesResult.rows) {
    const ruleData = rule as any;
    await db.execute(`
      INSERT INTO t_tournament_rules (
        tournament_id, phase, use_extra_time, use_penalty, active_periods,
        notes, point_system, walkover_settings,
        tie_breaking_rules, tie_breaking_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newTournamentId,
      ruleData.phase,
      ruleData.use_extra_time,
      ruleData.use_penalty,
      ruleData.active_periods,
      ruleData.notes || null,
      ruleData.point_system || null,
      ruleData.walkover_settings || null,
      ruleData.tie_breaking_rules || null,
      ruleData.tie_breaking_enabled !== undefined ? ruleData.tie_breaking_enabled : 1
    ]);
  }

  console.log(`[DUPLICATE] ルール複製完了: ${rulesResult.rows.length}件`);
}
