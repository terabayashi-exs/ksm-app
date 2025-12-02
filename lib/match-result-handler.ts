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
    // トランザクション開始
    await db.execute({ sql: 'BEGIN TRANSACTION' });

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
          team1_id, team2_id, team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores,
          winner_team_id, winner_tournament_team_id, is_draw, is_walkover, remarks,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `,
      args: [
        match.match_block_id,
        match.tournament_date,
        match.match_number,
        match.match_code,
        match.team1_id,
        match.team2_id,
        match.team1_tournament_team_id,
        match.team2_tournament_team_id,
        match.team1_display_name,
        match.team2_display_name,
        match.court_number,
        match.start_time,
        Math.floor(Number(match.team1_scores) || 0),
        Math.floor(Number(match.team2_scores) || 0),
        match.winner_team_id,
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
      sql: 'SELECT tournament_id FROM t_match_blocks WHERE match_block_id = ?',
      args: [matchBlockId]
    });

    if (blockResult.rows && blockResult.rows.length > 0) {
      const tournamentId = blockResult.rows[0].tournament_id as number;
      
      // トーナメント進出処理（決勝トーナメントの場合）
      try {
        const matchCode = match.match_code as string;
        const team1Id = match.team1_id as string | null;
        const team2Id = match.team2_id as string | null;
        const winnerId = match.winner_team_id as string | null;
        const isDraw = Boolean(match.is_draw);
        
        await processTournamentProgression(matchId, matchCode, team1Id, team2Id, winnerId, isDraw, tournamentId);
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

      // 決勝トーナメントの場合は決勝順位も更新
      const blockPhaseResult = await db.execute({
        sql: 'SELECT phase FROM t_match_blocks WHERE match_block_id = ?',
        args: [matchBlockId]
      });
      
      if (blockPhaseResult.rows.length > 0 && blockPhaseResult.rows[0].phase === 'final') {
        // テンプレートベースの順位設定を実行
        try {
          const winnerId = match.winner_team_id as string | null;
          const loserId = match.team1_id === winnerId ? match.team2_id as string : match.team1_id as string;
          
          if (winnerId && loserId) {
            await handleTemplateBasedPositions(matchId, winnerId, loserId, tournamentId);
          }
        } catch (templateError) {
          console.error(`[MATCH_CONFIRM] テンプレートベース順位設定エラー:`, templateError);
          // エラーでも処理は継続
        }
        
        // 従来の決勝順位計算も実行（フォールバック）
        await updateFinalTournamentRankings(tournamentId);
      }
      
      // 大会完了チェック
      await checkAndCompleteTournament(tournamentId);
    }

    // トランザクション確定
    await db.execute({ sql: 'COMMIT' });

  } catch (error) {
    // トランザクション回復
    await db.execute({ sql: 'ROLLBACK' });
    console.error('試合結果確定エラー:', error);
    throw new Error('試合結果の確定に失敗しました');
  }
}

/**
 * 複数の試合結果を一括確定する
 */
export async function confirmMultipleMatchResults(matchIds: number[]): Promise<void> {
  try {
    await db.execute({ sql: 'BEGIN TRANSACTION' });

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
            team1_id, team2_id, team1_tournament_team_id, team2_tournament_team_id,
            team1_display_name, team2_display_name,
            court_number, start_time, team1_scores, team2_scores,
            winner_team_id, winner_tournament_team_id, is_draw, is_walkover, remarks,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `,
        args: [
          match.match_block_id,
          match.tournament_date,
          match.match_number,
          match.match_code,
          match.team1_id,
          match.team2_id,
          match.team1_tournament_team_id,
          match.team2_tournament_team_id,
          match.team1_display_name,
          match.team2_display_name,
          match.court_number,
          match.start_time,
          Math.floor(Number(match.team1_scores) || 0),
          Math.floor(Number(match.team2_scores) || 0),
          match.winner_team_id,
          match.winner_tournament_team_id,
          match.is_draw,
          match.is_walkover,
          match.remarks
        ]
      });

      // トーナメント進出処理（各試合ごと）
      try {
        const blockResult = await db.execute({
          sql: 'SELECT tournament_id FROM t_match_blocks WHERE match_block_id = ?',
          args: [match.match_block_id]
        });
        
        if (blockResult.rows && blockResult.rows.length > 0) {
          const tournamentId = blockResult.rows[0].tournament_id as number;
          const matchCode = match.match_code as string;
          const team1Id = match.team1_id as string | null;
          const team2Id = match.team2_id as string | null;
          const winnerId = match.winner_team_id as string | null;
          const isDraw = Boolean(match.is_draw);
          
          await processTournamentProgression(matchId, matchCode, team1Id, team2Id, winnerId, isDraw, tournamentId);
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
                  ml.team1_id,
                  ml.team2_id,
                  mf.winner_team_id
                FROM t_matches_live ml
                LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
                WHERE ml.match_block_id = ?
                  AND mf.match_id IS NOT NULL
                  AND mf.winner_team_id IS NOT NULL
                ORDER BY ml.match_code DESC
                LIMIT 1
              `,
              args: [matchBlockId]
            });
            
            if (confirmedMatchesResult.rows.length > 0) {
              const latestMatch = confirmedMatchesResult.rows[0];
              const winnerId = latestMatch.winner_team_id as string;
              const loserId = latestMatch.team1_id === winnerId ? latestMatch.team2_id as string : latestMatch.team1_id as string;
              
              console.log(`[BULK_CONFIRM] テンプレートベース順位設定 (${latestMatch.match_code}): 勝者=${winnerId}, 敗者=${loserId}`);
              await handleTemplateBasedPositions(latestMatch.match_id as number, winnerId, loserId, tournamentId);
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

    await db.execute({ sql: 'COMMIT' });

    console.log(`${matchIds.length}試合の結果を一括確定し、${updatedBlocks.size}ブロックの順位表を更新しました`);

  } catch (error) {
    await db.execute({ sql: 'ROLLBACK' });
    console.error('一括試合結果確定エラー:', error);
    throw new Error('一括試合結果の確定に失敗しました');
  }
}