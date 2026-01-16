// app/api/matches/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateBlockRankingsOnMatchConfirm } from '@/lib/standings-calculator';
import { processTournamentProgression } from '@/lib/tournament-progression';
import { parseTotalScore } from '@/lib/score-parser';

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
        team1_id, team2_id, team1_tournament_team_id, team2_tournament_team_id,
        team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, winner_team_id, winner_tournament_team_id,
        is_draw, is_walkover, remarks, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      liveMatch.match_id,
      liveMatch.match_block_id,
      liveMatch.tournament_date,
      liveMatch.match_number,
      liveMatch.match_code,
      liveMatch.team1_id,
      liveMatch.team2_id,
      liveMatch.team1_tournament_team_id,
      liveMatch.team2_tournament_team_id,
      liveMatch.team1_display_name,
      liveMatch.team2_display_name,
      liveMatch.court_number,
      liveMatch.start_time,
      // スコアをそのまま保存（カンマ区切り形式を維持）
      liveMatch.team1_scores || '0',
      liveMatch.team2_scores || '0',
      liveMatch.winner_team_id,
      liveMatch.winner_tournament_team_id,
      liveMatch.winner_team_id ? 0 : 1, // is_draw: 勝者がいない場合は引き分け
      0, // is_walkover: 通常は0
      liveMatch.remarks,
      now,
      now
    ]);

    console.log(`[MATCH_CONFIRM] Match ${matchId} confirmed by ${confirmedBy}`);
    console.log(`[MATCH_CONFIRM] Original live scores:`, {
      team1_scores: liveMatch.team1_scores,
      team2_scores: liveMatch.team2_scores,
      team1_type: typeof liveMatch.team1_scores,
      team2_type: typeof liveMatch.team2_scores
    });
    
    // ログ用にスコア合計を計算
    const team1Total = parseTotalScore(liveMatch.team1_scores);
    const team2Total = parseTotalScore(liveMatch.team2_scores);
    
    console.log(`[MATCH_CONFIRM] Calculated totals: ${team1Total}-${team2Total}`);
    console.log(`[MATCH_CONFIRM] Match details: ${liveMatch.match_code} - ${liveMatch.team1_id} vs ${liveMatch.team2_id} (${team1Total}-${team2Total})`);

    // トーナメント進出処理（決勝トーナメントの場合）
    try {
      const tournamentId = liveResult.rows[0].tournament_id as number;
      const matchCode = liveMatch.match_code as string;
      const team1Id = liveMatch.team1_id as string | null;
      const team2Id = liveMatch.team2_id as string | null;
      const winnerId = liveMatch.winner_team_id as string | null;
      const isDraw = liveMatch.winner_team_id === null;
      
      console.log(`[MATCH_CONFIRM] Processing tournament progression for match ${matchCode}`);
      await processTournamentProgression(matchId, matchCode, team1Id, team2Id, winnerId, isDraw, tournamentId);
      console.log(`[MATCH_CONFIRM] ✅ Tournament progression processed for match ${matchCode}`);
    } catch (progressionError) {
      console.error(`[MATCH_CONFIRM] ❌ Failed to process tournament progression for match ${matchId}:`, progressionError);
      // トーナメント進出処理エラーでも試合確定は成功とする（ログのみ）
    }

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

    // 全試合が確定されたかチェックして、大会を完了に変更
    try {
      const tournamentId = liveResult.rows[0].tournament_id as number;
      
      console.log(`[MATCH_CONFIRM] Checking if tournament ${tournamentId} is complete...`);
      
      // 大会の全試合数を取得（team1_id/team2_idが設定されている試合のみ）
      const totalMatchesResult = await db.execute(`
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
          AND ml.team1_id IS NOT NULL
          AND ml.team2_id IS NOT NULL
      `, [tournamentId]);

      const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

      // 完了済み試合数を取得（確定済み OR 中止）
      const completedMatchesResult = await db.execute(`
        SELECT COUNT(*) as completed_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE mb.tournament_id = ?
          AND ml.team1_id IS NOT NULL
          AND ml.team2_id IS NOT NULL
          AND (mf.match_id IS NOT NULL OR ml.match_status = 'cancelled')
      `, [tournamentId]);

      const completedMatches = completedMatchesResult.rows[0]?.completed_matches as number || 0;

      console.log(`[MATCH_CONFIRM] Tournament ${tournamentId}: ${completedMatches}/${totalMatches} matches completed (confirmed or cancelled)`);

      // 全試合が完了している場合
      if (totalMatches > 0 && completedMatches >= totalMatches) {
        console.log(`[MATCH_CONFIRM] All matches confirmed for tournament ${tournamentId}. Setting status to completed.`);
        
        await db.execute(`
          UPDATE t_tournaments 
          SET status = 'completed', updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ?
        `, [tournamentId]);
        
        console.log(`[MATCH_CONFIRM] ✅ Tournament ${tournamentId} status updated to completed`);
      }
    } catch (completionError) {
      console.error(`[MATCH_CONFIRM] ❌ Failed to check tournament completion for tournament ID ${liveResult.rows[0].tournament_id}:`, completionError);
      // 大会完了チェックエラーでも試合確定は成功とする（ログのみ）
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