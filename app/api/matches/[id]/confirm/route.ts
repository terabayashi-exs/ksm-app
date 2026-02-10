// app/api/matches/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { updateBlockRankingsOnMatchConfirm } from '@/lib/standings-calculator';
import { processTournamentProgression } from '@/lib/tournament-progression';
import { parseTotalScore } from '@/lib/score-parser';
import { handleTemplateBasedPositions } from '@/lib/template-position-handler';

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

    // スコアから勝者を自動判定（winner_tournament_team_idがNULLの場合）
    let finalWinnerTournamentTeamId = liveMatch.winner_tournament_team_id;
    let isDraw = !liveMatch.winner_tournament_team_id;

    if (!finalWinnerTournamentTeamId && liveMatch.team1_scores && liveMatch.team2_scores) {
      const team1Total = parseTotalScore(liveMatch.team1_scores);
      const team2Total = parseTotalScore(liveMatch.team2_scores);

      if (team1Total > team2Total) {
        finalWinnerTournamentTeamId = liveMatch.team1_tournament_team_id;
        isDraw = false;
        console.log(`[MATCH_CONFIRM] Auto-detected winner from scores: team1 (${team1Total}-${team2Total})`);
      } else if (team2Total > team1Total) {
        finalWinnerTournamentTeamId = liveMatch.team2_tournament_team_id;
        isDraw = false;
        console.log(`[MATCH_CONFIRM] Auto-detected winner from scores: team2 (${team1Total}-${team2Total})`);
      } else {
        isDraw = true;
        console.log(`[MATCH_CONFIRM] Scores are equal, marking as draw (${team1Total}-${team2Total})`);
      }
    }

    await db.execute(`
      INSERT INTO t_matches_final (
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_tournament_team_id, team2_tournament_team_id,
        team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, winner_tournament_team_id,
        is_draw, is_walkover, remarks, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      liveMatch.match_id,
      liveMatch.match_block_id,
      liveMatch.tournament_date,
      liveMatch.match_number,
      liveMatch.match_code,
      liveMatch.team1_tournament_team_id,
      liveMatch.team2_tournament_team_id,
      liveMatch.team1_display_name,
      liveMatch.team2_display_name,
      liveMatch.court_number,
      liveMatch.start_time,
      // スコアをそのまま保存（カンマ区切り形式を維持）
      liveMatch.team1_scores || '0',
      liveMatch.team2_scores || '0',
      finalWinnerTournamentTeamId,
      isDraw ? 1 : 0, // is_draw: スコアから自動判定
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
    console.log(`[MATCH_CONFIRM] Match details: ${liveMatch.match_code} - ${liveMatch.team1_display_name} vs ${liveMatch.team2_display_name} (${team1Total}-${team2Total})`);

    // トーナメント進出処理（決勝トーナメントの場合）
    try {
      const tournamentId = liveResult.rows[0].tournament_id as number;
      const matchCode = liveMatch.match_code as string;
      const team1TournamentTeamId = liveMatch.team1_tournament_team_id as number | null;
      const team2TournamentTeamId = liveMatch.team2_tournament_team_id as number | null;
      const winnerTournamentTeamId = finalWinnerTournamentTeamId as number | null;
      const isDrawForProgression = isDraw;

      console.log(`[MATCH_CONFIRM] Processing tournament progression for match ${matchCode}`);
      await processTournamentProgression(matchId, matchCode, isDrawForProgression, tournamentId, team1TournamentTeamId, team2TournamentTeamId, winnerTournamentTeamId);
      console.log(`[MATCH_CONFIRM] ✅ Tournament progression processed for match ${matchCode}`);
    } catch (progressionError) {
      console.error(`[MATCH_CONFIRM] ❌ Failed to process tournament progression for match ${matchId}:`, progressionError);
      // トーナメント進出処理エラーでも試合確定は成功とする（ログのみ）
    }

    // トーナメント形式の順位設定（予選・決勝両方に対応）
    try {
      const matchBlockId = liveMatch.match_block_id as number;

      // ブロック情報とフォーマットタイプを取得
      const blockInfoResult = await db.execute(`
        SELECT
          mb.phase,
          CASE
            WHEN mb.phase = 'preliminary' THEN f.preliminary_format_type
            WHEN mb.phase = 'final' THEN f.final_format_type
            ELSE NULL
          END as format_type
        FROM t_match_blocks mb
        JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
        JOIN m_tournament_formats f ON t.format_id = f.format_id
        WHERE mb.match_block_id = ?
      `, [matchBlockId]);

      if (blockInfoResult.rows.length > 0) {
        const blockInfo = blockInfoResult.rows[0];
        const phase = blockInfo.phase as string;
        const formatType = blockInfo.format_type as string | null;

        // トーナメント形式の場合のみ順位設定を実行
        if (formatType === 'tournament') {
          console.log(`[MATCH_CONFIRM] トーナメント形式（${phase}）の順位設定を実行`);

          const winnerTournamentTeamId = finalWinnerTournamentTeamId as number | null;
          const team1TournamentTeamId = liveMatch.team1_tournament_team_id as number | null;
          const team2TournamentTeamId = liveMatch.team2_tournament_team_id as number | null;

          // 敗者のtournament_team_idを特定
          let loserTournamentTeamId: number | null = null;
          if (winnerTournamentTeamId && team1TournamentTeamId && team2TournamentTeamId) {
            loserTournamentTeamId = winnerTournamentTeamId === team1TournamentTeamId
              ? team2TournamentTeamId
              : team1TournamentTeamId;
          }

          if (winnerTournamentTeamId && loserTournamentTeamId) {
            console.log(`[MATCH_CONFIRM] テンプレートベース順位設定: winner_tournament_team_id=${winnerTournamentTeamId}, loser_tournament_team_id=${loserTournamentTeamId}`);
            await handleTemplateBasedPositions(
              matchId,
              winnerTournamentTeamId,
              loserTournamentTeamId
            );
          } else {
            console.log(`[MATCH_CONFIRM] 勝者・敗者の特定ができないため、順位設定をスキップ`);
          }
        }
      }
    } catch (templateError) {
      console.error(`[MATCH_CONFIRM] テンプレートベース順位設定エラー:`, templateError);
      // エラーでも処理は継続
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

      // 大会のフォーマットIDを取得
      const tournamentFormatResult = await db.execute(`
        SELECT format_id FROM t_tournaments WHERE tournament_id = ?
      `, [tournamentId]);

      const formatId = tournamentFormatResult.rows[0]?.format_id as number;

      // 大会の全試合数を取得（BYE試合のみ除外、チーム割当の有無は関係なし）
      const totalMatchesResult = await db.execute(`
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = mb.phase
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
      `, [formatId, tournamentId]);

      const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

      // 完了済み試合数を取得（確定済み OR 中止、BYE試合を除外）
      const completedMatchesResult = await db.execute(`
        SELECT COUNT(*) as completed_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = mb.phase
        WHERE mb.tournament_id = ?
          AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
          AND (mf.match_id IS NOT NULL OR ml.match_status = 'cancelled')
      `, [formatId, tournamentId]);

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