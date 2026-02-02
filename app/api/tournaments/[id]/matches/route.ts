// app/api/tournaments/[id]/matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の試合一覧を取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    console.log('API /tournaments/[id]/matches - Session check:', {
      hasSession: !!session,
      userRole: session?.user?.role,
      userId: session?.user?.id
    });
    
    if (!session || session.user.role !== 'admin') {
      console.log('Authentication failed:', { session: !!session, role: session?.user?.role });
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // クエリパラメータからincludeByeフラグを取得（組合せ作成画面用）
    const { searchParams } = new URL(request.url);
    const includeBye = searchParams.get('includeBye') === 'true';

    // 大会の存在確認とformat_id取得
    const tournamentResult = await db.execute(`
      SELECT tournament_id, format_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id;

    // 組み合わせ作成状況を判定
    console.log('Checking team assignment status...');
    const teamAssignmentResult = await db.execute(`
      SELECT COUNT(*) as total_matches,
             COUNT(CASE WHEN team1_id IS NOT NULL AND team2_id IS NOT NULL THEN 1 END) as assigned_matches
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    
    const teamAssignment = teamAssignmentResult.rows[0] as unknown as { total_matches: number; assigned_matches: number };
    const isTeamAssignmentComplete = teamAssignment.assigned_matches > 0;
    
    console.log(`[ADMIN] Team assignment status: ${teamAssignment.assigned_matches}/${teamAssignment.total_matches} matches assigned`);
    console.log(`[ADMIN] Is assignment complete: ${isTeamAssignmentComplete}`);

    // 試合データを取得（試合状態と確定結果も含む）
    console.log(`Fetching matches for tournament ${tournamentId}...`);
    // 全ての試合を取得（不戦勝試合のフィルタリングはフロントエンド側で実施）
    const teamFilter = '';
    const matchesResult = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_block_id,
        ml.tournament_date,
        ml.match_number,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_tournament_team_id,
        ml.team2_tournament_team_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        tc.court_name,
        ml.start_time,
        ml.team1_scores,
        ml.team2_scores,
        ml.period_count,
        ml.winner_team_id,
        ml.match_status as live_match_status,
        ml.remarks,
        ml.confirmed_by,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.block_order,
        -- m_match_templatesからround_name、day_number、team1_source、team2_source、is_bye_matchを取得
        mt.round_name,
        mt.day_number,
        mt.team1_source,
        mt.team2_source,
        mt.is_bye_match,
        -- 実際のチーム名を取得（tournament_team_idで一意に取得）
        tt1.team_name as team1_real_name,
        tt2.team_name as team2_real_name,
        -- 試合状態テーブルから情報取得
        ms.match_status,
        ms.current_period as status_current_period,
        ms.actual_start_time as status_actual_start_time,
        ms.actual_end_time as status_actual_end_time,
        ms.updated_by,
        ms.updated_at,
        -- 確定結果テーブルから情報取得
        mf.team1_scores as final_team1_scores,
        mf.team2_scores as final_team2_scores,
        mf.winner_team_id as final_winner_team_id,
        mf.is_draw as final_is_draw,
        mf.is_walkover as final_is_walkover,
        mf.updated_at as confirmed_at
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
      LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = ?
      ${teamFilter}
      ORDER BY
        CASE WHEN mb.phase = 'preliminary' THEN 1 WHEN mb.phase = 'final' THEN 2 ELSE 3 END,
        mt.round_name ASC,
        ml.match_number ASC
    `, [formatId, tournamentId]);

    console.log(`Found ${matchesResult.rows.length} matches for tournament ${tournamentId}`);

    // BYE試合のためのチーム名解決マップを作成
    // ブロック名 + ポジション番号 → 実チーム名 のマップ（例: T1 → ExsA）
    const blockPositionToTeamMap: Record<string, { block_name: string; team_name: string }> = {};

    // assigned_blockとblock_positionから実チーム名を取得してマップ化
    const teamBlockAssignments = await db.execute(`
      SELECT
        assigned_block,
        block_position,
        COALESCE(team_omission, team_name) as team_name
      FROM t_tournament_teams
      WHERE tournament_id = ? AND assigned_block IS NOT NULL AND block_position IS NOT NULL
    `, [tournamentId]);

    teamBlockAssignments.rows.forEach((row) => {
      const key = `${row.assigned_block}-${row.block_position}`;
      blockPositionToTeamMap[key] = {
        block_name: String(row.assigned_block),
        team_name: String(row.team_name)
      };
    });

    console.log('[Matches API] Block position to team map:', blockPositionToTeamMap);

    const matches = matchesResult.rows.map(row => {
      // 試合状態の決定（t_match_statusを優先、なければt_matches_liveから）
      const matchStatus = row.match_status || row.live_match_status || 'scheduled';

      // 現在のピリオド（t_match_statusを優先）
      const currentPeriod = row.status_current_period || 1;

      // 実際の開始・終了時刻（t_match_statusを優先）
      const actualStartTime = row.status_actual_start_time;
      const actualEndTime = row.status_actual_end_time;

      // 確定済みかどうかの判定
      // t_matches_finalにレコードが存在する場合のみ確定扱い
      const isConfirmed = !!row.confirmed_at;

      // スコア情報（確定済みなら最終結果、そうでなければライブスコア）
      const team1ScoresStr = isConfirmed ? row.final_team1_scores : row.team1_scores;
      const team2ScoresStr = isConfirmed ? row.final_team2_scores : row.team2_scores;

      // BYE試合でチーム名が取得できない場合、プレースホルダーから実チーム名を解決
      let resolvedTeam1Name = String(row.team1_real_name || row.team1_display_name || '');
      let resolvedTeam2Name = String(row.team2_real_name || row.team2_display_name || '');

      if (row.is_bye_match === 1) {
        // プレースホルダー（例: "A1チーム", "A2チーム", "B1チーム"）からポジション番号を抽出
        const extractPosition = (displayName: string): number | null => {
          // "A1チーム", "A2チーム", "B1チーム" などからポジション番号を抽出
          // 正規表現: 任意のアルファベット + 数字 + "チーム"
          const match = displayName.match(/([A-Za-z]+)(\d+)チーム$/);
          return match ? parseInt(match[2]) : null;
        };

        // team1_display_name がプレースホルダーの場合、実チーム名に変換
        if (!row.team1_real_name && row.team1_display_name && row.block_name) {
          const position = extractPosition(String(row.team1_display_name));
          if (position !== null) {
            const key = `${row.block_name}-${position}`;
            const teamData = blockPositionToTeamMap[key];
            if (teamData) {
              resolvedTeam1Name = teamData.team_name;
              console.log(`[BYE Match] Resolved team1: ${row.team1_display_name} (block=${row.block_name}, pos=${position}) → ${teamData.team_name}`);
            }
          }
        }

        // team2_display_name がプレースホルダーの場合、実チーム名に変換
        if (!row.team2_real_name && row.team2_display_name && row.block_name) {
          const position = extractPosition(String(row.team2_display_name));
          if (position !== null) {
            const key = `${row.block_name}-${position}`;
            const teamData = blockPositionToTeamMap[key];
            if (teamData) {
              resolvedTeam2Name = teamData.team_name;
              console.log(`[BYE Match] Resolved team2: ${row.team2_display_name} (block=${row.block_name}, pos=${position}) → ${teamData.team_name}`);
            }
          }
        }
      }
      
      return {
        match_id: Number(row.match_id),
        match_block_id: Number(row.match_block_id),
        tournament_date: String(row.tournament_date || ''),
        match_number: Number(row.match_number),
        match_code: String(row.match_code),
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        team1_tournament_team_id: row.team1_tournament_team_id ? Number(row.team1_tournament_team_id) : null,
        team2_tournament_team_id: row.team2_tournament_team_id ? Number(row.team2_tournament_team_id) : null,
        team1_name: resolvedTeam1Name, // BYE試合対応：プレースホルダーから実チーム名に解決
        team2_name: resolvedTeam2Name, // BYE試合対応：プレースホルダーから実チーム名に解決
        court_number: row.court_number ? Number(row.court_number) : null,
        court_name: row.court_name ? String(row.court_name) : null,
        scheduled_time: row.start_time ? String(row.start_time) : null, // scheduled_timeに統一
        period_count: Number(row.period_count || 1),
        current_period: currentPeriod,
        match_status: matchStatus,
        actual_start_time: actualStartTime,
        actual_end_time: actualEndTime,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
        // スコア情報
        team1_scores: team1ScoresStr,
        team2_scores: team2ScoresStr,
        final_team1_scores: row.final_team1_scores,
        final_team2_scores: row.final_team2_scores,
        winner_team_id: row.final_winner_team_id || row.winner_team_id,
        is_confirmed: isConfirmed,
        is_draw: row.final_is_draw ? Boolean(row.final_is_draw) : false,
        is_walkover: row.final_is_walkover ? Boolean(row.final_is_walkover) : false,
        confirmed_at: row.confirmed_at,
        remarks: row.remarks ? String(row.remarks) : null,
        // ブロック情報
        phase: String(row.phase),
        display_round_name: String(row.round_name || row.display_round_name),
        round_name: row.round_name ? String(row.round_name) : null,
        block_name: row.block_name ? String(row.block_name) : null,
        match_type: String(row.match_type),
        block_order: Number(row.block_order),
        // テンプレート情報（不戦勝対応）
        team1_source: row.team1_source ? String(row.team1_source) : null,
        team2_source: row.team2_source ? String(row.team2_source) : null,
        is_bye_match: row.is_bye_match ? Number(row.is_bye_match) : 0,
        team1_display_name: String(row.team1_display_name || ''),
        team2_display_name: String(row.team2_display_name || '')
      };
    });

    // 不戦勝試合の勝者をマップに保存
    const byeMatchWinners: Record<string, string> = {};
    matches.forEach((m) => {
      if (m.is_bye_match === 1) {
        // 不戦勝試合の勝者を特定（空でない方のチーム）
        // team1_name/team2_nameには実チーム名が入っている
        const winner = m.team1_name || m.team2_name;
        if (winner && m.match_code) {
          byeMatchWinners[`${m.match_code}_winner`] = winner;
        }
      }
    });

    // team1_source/team2_sourceに基づいて、不戦勝の勝者を反映
    const resolvedMatches = matches.map((m) => {
      let resolvedTeam1 = m.team1_name;
      let resolvedTeam2 = m.team2_name;

      if (m.team1_source && byeMatchWinners[m.team1_source]) {
        resolvedTeam1 = byeMatchWinners[m.team1_source];
      }
      if (m.team2_source && byeMatchWinners[m.team2_source]) {
        resolvedTeam2 = byeMatchWinners[m.team2_source];
      }

      return {
        ...m,
        team1_name: resolvedTeam1,
        team2_name: resolvedTeam2,
        // display_nameも同期（後方互換性のため）
        team1_display_name: resolvedTeam1,
        team2_display_name: resolvedTeam2
      };
    });

    // BYE試合（is_bye_match=1）を除外（組合せ作成画面ではincludeBye=trueで含める）
    const finalMatches = includeBye ? resolvedMatches : resolvedMatches.filter(m => m.is_bye_match !== 1);

    return NextResponse.json({
      success: true,
      data: finalMatches
    });

  } catch (error) {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    
    console.error('試合データ取得エラー:', error);
    console.error('Tournament ID:', tournamentId);
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return NextResponse.json(
      { 
        success: false, 
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
        tournamentId: tournamentId
      },
      { status: 500 }
    );
  }
}