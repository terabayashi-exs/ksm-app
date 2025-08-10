// app/api/matches/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 試合状態の取得
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    // 試合状態と基本情報を取得（実チーム名も含む）
    const result = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        ml.start_time,
        ml.team1_scores,
        ml.team2_scores,
        ml.period_count,
        ml.current_period,
        ml.winner_team_id,
        ml.remarks,
        ms.match_status,
        ms.actual_start_time,
        ms.actual_end_time,
        ms.updated_by,
        ms.updated_at,
        mb.tournament_id,
        -- 実際のチーム名と略称を取得
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name,
        mt1.team_omission as team1_omission,
        mt2.team_omission as team2_omission
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
      LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
      LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_id = ?
    `, [matchId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    const match = result.rows[0];
    
    // デバッグログ：winner_team_idの状態を確認
    console.log('Match status API - winner_team_id:', match.winner_team_id);
    console.log('Match status API - team IDs:', { team1_id: match.team1_id, team2_id: match.team2_id });

    return NextResponse.json({
      success: true,
      data: {
        match_id: match.match_id,
        match_code: match.match_code,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1_name: match.team1_real_name || match.team1_display_name, // 実チーム名を優先
        team2_name: match.team2_real_name || match.team2_display_name, // 実チーム名を優先
        team1_omission: match.team1_omission,
        team2_omission: match.team2_omission,
        court_number: match.court_number,
        scheduled_time: match.start_time,
        period_count: match.period_count,
        current_period: match.current_period,
        match_status: match.match_status || 'scheduled',
        actual_start_time: match.actual_start_time,
        actual_end_time: match.actual_end_time,
        team1_scores: [Number(match.team1_scores) || 0],
        team2_scores: [Number(match.team2_scores) || 0],
        winner_team_id: match.winner_team_id,
        remarks: match.remarks,
        updated_by: match.updated_by,
        updated_at: match.updated_at
      }
    });

  } catch (error) {
    console.error('Match status get error:', error);
    return NextResponse.json(
      { success: false, error: '試合状態の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 試合状態の更新
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);
    const body = await request.json();

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    const { action, updated_by, current_period, team1_scores, team2_scores, winner_team_id, remarks } = body;

    console.log('Match status update request:', {
      matchId,
      action,
      updated_by,
      current_period,
      team1_scores,
      team2_scores,
      winner_team_id,
      remarks
    });

    // アクション別処理
    switch (action) {
      case 'start':
        // 試合開始（日本時間で記録）
        await db.execute(`
          INSERT OR REPLACE INTO t_match_status (
            match_id, match_block_id, match_status, actual_start_time, current_period, updated_by, updated_at
          )
          SELECT ?, match_block_id, 'ongoing', datetime('now', '+9 hours'), 1, ?, datetime('now', '+9 hours')
          FROM t_matches_live WHERE match_id = ?
        `, [matchId, updated_by, matchId]);

        await db.execute(`
          UPDATE t_matches_live 
          SET match_status = 'ongoing', actual_start_time = datetime('now', '+9 hours'), current_period = 1
          WHERE match_id = ?
        `, [matchId]);
        break;

      case 'end':
        // 試合終了（日本時間で記録）
        await db.execute(`
          UPDATE t_match_status 
          SET match_status = 'completed', actual_end_time = datetime('now', '+9 hours'), updated_by = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [updated_by, matchId]);

        await db.execute(`
          UPDATE t_matches_live 
          SET match_status = 'completed', actual_end_time = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [matchId]);
        break;

      case 'update_period':
        // ピリオド更新
        await db.execute(`
          UPDATE t_match_status 
          SET current_period = ?, updated_by = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [current_period, updated_by, matchId]);

        await db.execute(`
          UPDATE t_matches_live 
          SET current_period = ?
          WHERE match_id = ?
        `, [current_period, matchId]);
        break;

      case 'update_scores':
        // スコア・結果更新
        if (team1_scores && team2_scores) {
          // 配列の場合は合計を計算、数値の場合はそのまま使用
          const team1Total = Array.isArray(team1_scores) ? team1_scores.reduce((sum, score) => sum + score, 0) : team1_scores;
          const team2Total = Array.isArray(team2_scores) ? team2_scores.reduce((sum, score) => sum + score, 0) : team2_scores;

          console.log('Updating scores:', {
            team1Total,
            team2Total,
            winner_team_id,
            remarks,
            matchId
          });

          await db.execute(`
            UPDATE t_matches_live 
            SET team1_scores = ?, team2_scores = ?, winner_team_id = ?, remarks = ?, updated_at = datetime('now', '+9 hours')
            WHERE match_id = ?
          `, [team1Total, team2Total, winner_team_id, remarks, matchId]);
        }
        break;

      case 'cancel':
        // 試合中止（日本時間で記録）
        await db.execute(`
          UPDATE t_match_status 
          SET match_status = 'cancelled', updated_by = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [updated_by, matchId]);

        await db.execute(`
          UPDATE t_matches_live 
          SET match_status = 'cancelled'
          WHERE match_id = ?
        `, [matchId]);
        break;

      default:
        return NextResponse.json(
          { success: false, error: '無効なアクションです' },
          { status: 400 }
        );
    }

    // 更新後の状態を取得
    const updatedResult = await db.execute(`
      SELECT 
        ml.*,
        ms.match_status,
        ms.actual_start_time,
        ms.actual_end_time,
        ms.updated_by,
        ms.updated_at as status_updated_at
      FROM t_matches_live ml
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_id = ?
    `, [matchId]);

    const updatedMatch = updatedResult.rows[0];

    return NextResponse.json({
      success: true,
      message: `試合状態を${action}に更新しました`,
      data: {
        match_id: updatedMatch.match_id,
        match_status: updatedMatch.match_status,
        current_period: updatedMatch.current_period,
        actual_start_time: updatedMatch.actual_start_time,
        actual_end_time: updatedMatch.actual_end_time,
        team1_scores: [Number(updatedMatch.team1_scores) || 0],
        team2_scores: [Number(updatedMatch.team2_scores) || 0],
        updated_by: updatedMatch.updated_by,
        updated_at: updatedMatch.status_updated_at
      }
    });

  } catch (error) {
    console.error('Match status update error:', error);
    return NextResponse.json(
      { success: false, error: '試合状態の更新に失敗しました' },
      { status: 500 }
    );
  }
}