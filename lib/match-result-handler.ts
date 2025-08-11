// lib/match-result-handler.ts
import { db } from '@/lib/db';
import { updateBlockRankingsOnMatchConfirm } from '@/lib/standings-calculator';

/**
 * 試合結果をt_matches_liveからt_matches_finalに移行し、順位表を更新する
 */
export async function confirmMatchResult(matchId: number): Promise<void> {
  try {
    // トランザクション開始
    await db.execute({ sql: 'BEGIN TRANSACTION' });

    // t_matches_liveから試合データを取得
    const liveMatchResult = await db.execute({
      sql: `
        SELECT * FROM t_matches_live 
        WHERE match_id = ? AND result_status = 'pending'
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
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores,
          winner_team_id, is_draw, is_walkover, remarks,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
      `,
      args: [
        match.match_block_id,
        match.tournament_date,
        match.match_number,
        match.match_code,
        match.team1_id,
        match.team2_id,
        match.team1_display_name,
        match.team2_display_name,
        match.court_number,
        match.start_time,
        match.team1_goals,
        match.team2_goals,
        match.winner_team_id,
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

    // ブロック情報を取得して順位表を更新
    const blockResult = await db.execute({
      sql: 'SELECT tournament_id FROM t_match_blocks WHERE match_block_id = ?',
      args: [matchBlockId]
    });

    if (blockResult.rows && blockResult.rows.length > 0) {
      const tournamentId = blockResult.rows[0].tournament_id as number;
      
      // 順位表を更新
      await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);
    }

    // トランザクション確定
    await db.execute({ sql: 'COMMIT' });

    console.log(`試合 ${matchId} の結果を確定し、順位表を更新しました`);

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
      // 各試合を確定（順位表更新は後でまとめて実行）
      const liveMatchResult = await db.execute({
        sql: `
          SELECT * FROM t_matches_live 
          WHERE match_id = ? AND result_status = 'pending'
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
            team1_id, team2_id, team1_display_name, team2_display_name,
            court_number, start_time, team1_scores, team2_scores,
            winner_team_id, is_draw, is_walkover, remarks,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
        `,
        args: [
          match.match_block_id,
          match.tournament_date,
          match.match_number,
          match.match_code,
          match.team1_id,
          match.team2_id,
          match.team1_display_name,
          match.team2_display_name,
          match.court_number,
          match.start_time,
          match.team1_goals,
          match.team2_goals,
          match.winner_team_id,
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
    }

    // 更新されたブロックの順位表を一括更新
    for (const matchBlockId of updatedBlocks) {
      const blockResult = await db.execute({
        sql: 'SELECT tournament_id FROM t_match_blocks WHERE match_block_id = ?',
        args: [matchBlockId]
      });

      if (blockResult.rows && blockResult.rows.length > 0) {
        const tournamentId = blockResult.rows[0].tournament_id as number;
        await updateBlockRankingsOnMatchConfirm(matchBlockId, tournamentId);
      }
    }

    await db.execute({ sql: 'COMMIT' });

    console.log(`${matchIds.length}試合の結果を一括確定し、${updatedBlocks.size}ブロックの順位表を更新しました`);

  } catch (error) {
    await db.execute({ sql: 'ROLLBACK' });
    console.error('一括試合結果確定エラー:', error);
    throw new Error('一括試合結果の確定に失敗しました');
  }
}