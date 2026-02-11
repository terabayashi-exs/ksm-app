// lib/match-result-handler.ts
import { db } from '@/lib/db';
import { updateFinalTournamentRankings, updateBlockRankingsOnMatchConfirm } from '@/lib/standings-calculator';
import { processTournamentProgression } from '@/lib/tournament-progression';
import { handleTemplateBasedPositions } from '@/lib/template-position-handler';
import { checkAndPromoteOnMatchConfirm } from '@/lib/tournament-promotion';

/**
 * 大会の全試合が確定されているかチェックし、完了していれば大会ステータスを更新する
 */
async function checkAndCompleteTournament(tournamentId: number): Promise<void> {
  try {
    // 大会の全試合数を取得
    const totalMatchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total_matches
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      `,
      args: [tournamentId]
    });
    
    const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;
    
    // 確定済み試合数を取得
    const confirmedMatchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as confirmed_matches
        FROM t_matches_final mf
        INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      `,
      args: [tournamentId]
    });
    
    const confirmedMatches = confirmedMatchesResult.rows[0]?.confirmed_matches as number || 0;
    
    // 全試合が確定されている場合
    if (totalMatches > 0 && confirmedMatches >= totalMatches) {
      await db.execute({
        sql: `
          UPDATE t_tournaments 
          SET status = 'completed', updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ?
        `,
        args: [tournamentId]
      });
    }
  } catch (completionError) {
    console.error(`[TOURNAMENT_COMPLETION] ❌ Failed to check tournament completion for tournament ID ${tournamentId}:`, completionError);
    // エラーが発生してもメイン処理は継続
  }
}

/**
 * 試合結果をt_matches_liveからt_matches_finalに移行し、順位表を更新する
 */
export async function confirmMatchResult(matchId: number): Promise<void> {
  try {
    // Tursoではトランザクションがサポートされていないため、個別処理で実行

    // t_matches_liveから試合データを取得（中止試合は除外）
    const liveMatchResult = await db.execute({
      sql: `
        SELECT * FROM t_matches_live
        WHERE match_id = ?
          AND result_status = 'pending'
          AND (match_status IS NULL OR match_status != 'cancelled')
      `,
      args: [matchId]
    });

    if (!liveMatchResult.rows || liveMatchResult.rows.length === 0) {
      throw new Error('確定対象の試合が見つかりません');
    }

    const match = liveMatchResult.rows[0];
    const matchBlockId = match.match_block_id as number;

    // t_matches_finalに挿入
    await db.execute({
      sql: `
        INSERT INTO t_matches_final (
          match_block_id, tournament_date, match_number, match_code,
          team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores,
          winner_tournament_team_id, is_draw, is_walkover, remarks,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `,
      args: [
        match.match_block_id,
        match.tournament_date,
        match.match_number,
        match.match_code,
        match.team1_tournament_team_id,
        match.team2_tournament_team_id,
        match.team1_display_name,
        match.team2_display_name,
        match.court_number,
        match.start_time,
        Math.floor(Number(match.team1_scores) || 0),
        Math.floor(Number(match.team2_scores) || 0),
        match.winner_tournament_team_id,
        match.is_draw,
        match.is_walkover,
        match.remarks
      ]
    });

    // t_matches_liveから削除
    await db.execute({
      sql: 'DELETE FROM t_matches_live WHERE match_id = ?',
      args: [matchId]
    });

    // ブロック情報を取得してトーナメント進出処理と順位表を更新
    const blockResult = await db.execute({
      sql: 'SELECT tournament_id, phase FROM t_match_blocks WHERE match_block_id = ?',
      args: [matchBlockId]
    });

    if (blockResult.rows && blockResult.rows.length > 0) {
      const tournamentId = blockResult.rows[0].tournament_id as number;
      const phase = blockResult.rows[0].phase as string;

      // トーナメント進出処理（決勝トーナメントの場合）
      try {
        const matchCode = match.match_code as string;
        const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
        const team2TournamentTeamId = match.team2_tournament_team_id as number | null;
        const winnerTournamentTeamId = match.winner_tournament_team_id as number | null;
        const isDraw = Boolean(match.is_draw);

        await processTournamentProgression(matchId, matchCode, isDraw, tournamentId, team1TournamentTeamId, team2TournamentTeamId, winnerTournamentTeamId, phase);
      } catch (progressionError) {
        console.error('トーナメント進出処理エラー:', progressionError);
        // トーナメント進出処理エラーでも処理を継続
      }
      
      // 順位表を更新（多競技対応版）
      await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);

      // オーバーライド設定を考慮した自動進出チェック
      try {
        const matchCode = match.match_code as string;
        await checkAndPromoteOnMatchConfirm(tournamentId, matchBlockId, matchCode);
      } catch (promoteError) {
        console.error(`[MATCH_CONFIRM] オーバーライド考慮の自動進出処理でエラーが発生しましたが、試合確定は完了しました:`, promoteError);
        // エラーが発生しても試合確定処理は成功とする
      }

      // トーナメント形式の場合は順位設定を実行（予選・決勝両方対応）
      // MIGRATION NOTE: preliminary_format_type='tournament'と final_format_type='tournament'の両方に対応
      const blockInfoResult = await db.execute({
        sql: `
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
        `,
        args: [matchBlockId]
      });

      if (blockInfoResult.rows.length > 0) {
        const blockInfo = blockInfoResult.rows[0];
        const phase = blockInfo.phase as string;
        const formatType = blockInfo.format_type as string | null;

        // トーナメント形式の場合のみ順位設定を実行
        if (formatType === 'tournament') {
          console.log(`[MATCH_CONFIRM] トーナメント形式（${phase}）の順位設定を実行`);

          // テンプレートベースの順位設定を実行
          // MIGRATION NOTE: tournament_team_idベースに変更
          try {
            const winnerTournamentTeamId = match.winner_tournament_team_id as number | null;
            const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
            const team2TournamentTeamId = match.team2_tournament_team_id as number | null;

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
          } catch (templateError) {
            console.error(`[MATCH_CONFIRM] テンプレートベース順位設定エラー:`, templateError);
            // エラーでも処理は継続
          }

          // 決勝の場合は従来の順位計算も実行（フォールバック）
          if (phase === 'final') {
            await updateFinalTournamentRankings(tournamentId);
          }
        }
      }
      
      // 大会完了チェック
      await checkAndCompleteTournament(tournamentId);
    }

    // Tursoではトランザクションがサポートされていないため、コミット不要

  } catch (error) {
    // Tursoではトランザクションがサポートされていないため、ロールバック不可
    console.error('試合結果確定エラー:', error);
    throw new Error('試合結果の確定に失敗しました');
  }
}

/**
 * 複数の試合結果を一括確定する
 */
export async function confirmMultipleMatchResults(matchIds: number[]): Promise<void> {
  try {
    // Tursoではトランザクションがサポートされていないため、個別処理で実行

    const updatedBlocks = new Set<number>();

    for (const matchId of matchIds) {
      // 各試合を確定（順位表更新は後でまとめて実行）（中止試合は除外）
      const liveMatchResult = await db.execute({
        sql: `
          SELECT * FROM t_matches_live
          WHERE match_id = ?
            AND result_status = 'pending'
            AND (match_status IS NULL OR match_status != 'cancelled')
        `,
        args: [matchId]
      });

      if (!liveMatchResult.rows || liveMatchResult.rows.length === 0) {
        console.warn(`試合 ${matchId} は確定対象ではありません`);
        continue;
      }

      const match = liveMatchResult.rows[0];
      updatedBlocks.add(match.match_block_id as number);

      // t_matches_finalに挿入
      await db.execute({
        sql: `
          INSERT INTO t_matches_final (
            match_block_id, tournament_date, match_number, match_code,
            team1_tournament_team_id, team2_tournament_team_id,
            team1_display_name, team2_display_name,
            court_number, start_time, team1_scores, team2_scores,
            winner_tournament_team_id, is_draw, is_walkover, remarks,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `,
        args: [
          match.match_block_id,
          match.tournament_date,
          match.match_number,
          match.match_code,
          match.team1_tournament_team_id,
          match.team2_tournament_team_id,
          match.team1_display_name,
          match.team2_display_name,
          match.court_number,
          match.start_time,
          Math.floor(Number(match.team1_scores) || 0),
          Math.floor(Number(match.team2_scores) || 0),
          match.winner_tournament_team_id,
          match.is_draw,
          match.is_walkover,
          match.remarks
        ]
      });

      // トーナメント進出処理（各試合ごと）
      try {
        const blockResult = await db.execute({
          sql: 'SELECT tournament_id, phase FROM t_match_blocks WHERE match_block_id = ?',
          args: [match.match_block_id]
        });

        if (blockResult.rows && blockResult.rows.length > 0) {
          const tournamentId = blockResult.rows[0].tournament_id as number;
          const phase = blockResult.rows[0].phase as string;
          const matchCode = match.match_code as string;
          const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
          const team2TournamentTeamId = match.team2_tournament_team_id as number | null;
          const winnerTournamentTeamId = match.winner_tournament_team_id as number | null;
          const isDraw = Boolean(match.is_draw);

          await processTournamentProgression(matchId, matchCode, isDraw, tournamentId, team1TournamentTeamId, team2TournamentTeamId, winnerTournamentTeamId, phase);
          console.log(`一括確定でトーナメント進出処理完了: ${matchCode}`);
        }
      } catch (progressionError) {
        console.error(`一括確定でトーナメント進出処理エラー (${matchId}):`, progressionError);
        // エラーでも処理を継続
      }

      // t_matches_liveから削除
      await db.execute({
        sql: 'DELETE FROM t_matches_live WHERE match_id = ?',
        args: [matchId]
      });
    }

    // 更新されたブロックの順位表を一括更新
    const affectedTournaments = new Set<number>();
    const finalTournamentsToUpdate = new Set<number>();

    for (const matchBlockId of updatedBlocks) {
      const blockResult = await db.execute({
        sql: 'SELECT tournament_id, phase, block_name FROM t_match_blocks WHERE match_block_id = ?',
        args: [matchBlockId]
      });

      if (blockResult.rows && blockResult.rows.length > 0) {
        const tournamentId = blockResult.rows[0].tournament_id as number;
        const phase = blockResult.rows[0].phase as string;
        const blockName = blockResult.rows[0].block_name as string;

        affectedTournaments.add(tournamentId);
        await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);

        // オーバーライド設定を考慮した自動進出チェック（一括確定時）
        try {
          await checkAndPromoteOnMatchConfirm(tournamentId, matchBlockId, blockName);
        } catch (promoteError) {
          console.error(`[BULK_CONFIRM] オーバーライド考慮の自動進出処理でエラーが発生しました (Block ${matchBlockId}):`, promoteError);
          // エラーが発生しても処理は継続
        }
        
        // 決勝トーナメントの場合はテンプレートベース順位設定と決勝順位更新対象に追加
        if (phase === 'final') {
          finalTournamentsToUpdate.add(tournamentId);
          
          // 一括確定でもテンプレートベース順位設定を実行
          try {
            // 該当ブロックの確定済み試合でテンプレート処理
            const confirmedMatchesResult = await db.execute({
              sql: `
                SELECT
                  ml.match_id,
                  ml.match_code,
                  ml.team1_tournament_team_id,
                  ml.team2_tournament_team_id,
                  mf.winner_tournament_team_id
                FROM t_matches_live ml
                LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
                WHERE ml.match_block_id = ?
                  AND mf.match_id IS NOT NULL
                  AND mf.winner_tournament_team_id IS NOT NULL
                ORDER BY ml.match_code DESC
                LIMIT 1
              `,
              args: [matchBlockId]
            });
            
            if (confirmedMatchesResult.rows.length > 0) {
              const latestMatch = confirmedMatchesResult.rows[0];
              const winnerTournamentTeamId = latestMatch.winner_tournament_team_id as number;
              const team1TournamentTeamId = latestMatch.team1_tournament_team_id as number;
              const team2TournamentTeamId = latestMatch.team2_tournament_team_id as number;
              const loserTournamentTeamId = winnerTournamentTeamId === team1TournamentTeamId ? team2TournamentTeamId : team1TournamentTeamId;

              console.log(`[BULK_CONFIRM] テンプレートベース順位設定 (${latestMatch.match_code}): winner_tournament_team_id=${winnerTournamentTeamId}, loser_tournament_team_id=${loserTournamentTeamId}`);
              await handleTemplateBasedPositions(latestMatch.match_id as number, winnerTournamentTeamId, loserTournamentTeamId);
            }
          } catch (templateError) {
            console.error(`[BULK_CONFIRM] テンプレートベース順位設定エラー (Block ${matchBlockId}):`, templateError);
            // エラーでも処理は継続
          }
        }
      }
    }

    // 決勝トーナメントの順位を更新
    for (const tournamentId of finalTournamentsToUpdate) {
      console.log(`[BULK_CONFIRM] 決勝トーナメント順位一括更新: Tournament ${tournamentId}`);
      await updateFinalTournamentRankings(tournamentId);
    }

    // 影響を受けた大会の完了チェック
    for (const tournamentId of affectedTournaments) {
      await checkAndCompleteTournament(tournamentId);
    }

    // Tursoではトランザクションがサポートされていないため、コミット不要

    console.log(`${matchIds.length}試合の結果を一括確定し、${updatedBlocks.size}ブロックの順位表を更新しました`);

  } catch (error) {
    // Tursoではトランザクションがサポートされていないため、ロールバック不可
    console.error('一括試合結果確定エラー:', error);
    throw new Error('一括試合結果の確定に失敗しました');
  }
}