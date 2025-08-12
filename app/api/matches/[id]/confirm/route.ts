// app/api/matches/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateBlockRankingsOnMatchConfirm } from '@/lib/standings-calculator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 試合結果確定
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    // t_matches_liveから試合データを取得
    const liveResult = await db.execute(`
      SELECT 
        ml.*,
        mb.tournament_id,
        ms.match_status,
        ms.actual_start_time,
        ms.actual_end_time
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_id = ?
    `, [matchId]);

    if (liveResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    const liveMatch = liveResult.rows[0];
    
    // 既に確定済みかチェック
    const finalResult = await db.execute(`
      SELECT match_id FROM t_matches_final WHERE match_id = ?
    `, [matchId]);

    if (finalResult.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: '既に確定済みの試合です' },
        { status: 400 }
      );
    }

    // t_matches_finalにデータを移行
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const confirmedBy = session.user.id || session.user.email;

    await db.execute(`
      INSERT INTO t_matches_final (
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, winner_team_id,
        is_draw, is_walkover, remarks, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      liveMatch.match_id,
      liveMatch.match_block_id,
      liveMatch.tournament_date,
      liveMatch.match_number,
      liveMatch.match_code,
      liveMatch.team1_id,
      liveMatch.team2_id,
      liveMatch.team1_display_name,
      liveMatch.team2_display_name,
      liveMatch.court_number,
      liveMatch.start_time,
      Math.floor(Number(liveMatch.team1_scores) || 0),
      Math.floor(Number(liveMatch.team2_scores) || 0),
      liveMatch.winner_team_id,
      liveMatch.winner_team_id ? 0 : 1, // is_draw: 勝者がいない場合は引き分け
      0, // is_walkover: 通常は0
      liveMatch.remarks,
      now,
      now
    ]);

    console.log(`[MATCH_CONFIRM] Match ${matchId} confirmed by ${confirmedBy}`);
    console.log(`[MATCH_CONFIRM] Match details: ${liveMatch.match_code} - ${liveMatch.team1_id} vs ${liveMatch.team2_id} (${liveMatch.team1_scores}-${liveMatch.team2_scores})`);

    // 順位表を更新
    try {
      // tournament_idはJOINで取得済み
      const tournamentId = liveResult.rows[0].tournament_id as number;
      const matchBlockId = liveMatch.match_block_id as number;
      
      console.log(`[MATCH_CONFIRM] Starting standings update for block ${matchBlockId}, tournament ${tournamentId}`);
      await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);
      console.log(`[MATCH_CONFIRM] ✅ Block ${matchBlockId} standings updated successfully after match ${matchId} confirmation`);
    } catch (standingsError) {
      console.error(`[MATCH_CONFIRM] ❌ Failed to update standings for match ${matchId}:`, standingsError);
      console.error(`[MATCH_CONFIRM] Error details:`, {
        message: standingsError instanceof Error ? standingsError.message : 'Unknown error',
        stack: standingsError instanceof Error ? standingsError.stack : 'No stack trace',
        matchId,
        matchBlockId: liveMatch.match_block_id,
        tournamentId: liveResult.rows[0].tournament_id
      });
      // 順位表更新エラーでも試合確定は成功とする（ログのみ）
    }

    return NextResponse.json({
      success: true,
      message: '試合結果を確定しました',
      data: {
        match_id: matchId,
        confirmed_by: confirmedBy,
        confirmed_at: now
      }
    });

  } catch (error) {
    console.error('Match confirmation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合結果の確定に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}