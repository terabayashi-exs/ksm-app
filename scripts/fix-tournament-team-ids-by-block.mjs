#!/usr/bin/env node

/**
 * tournament_team_idをブロック情報を使って正しく設定
 *
 * 問題: 同じteam_idで複数エントリーがある場合、LIMIT 1では正しいtournament_team_idを特定できない
 * 解決: 試合のブロック情報とt_tournament_teamsのassigned_blockを照合して正しいtournament_team_idを取得
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

const TOURNAMENT_ID = 84;

async function fixTournamentTeamIdsByBlock() {
  try {
    console.log(`\n=== 部門${TOURNAMENT_ID}のtournament_team_idをブロック情報で修正 ===\n`);

    // t_matches_liveの修正
    console.log('📋 t_matches_liveの予選試合を修正中...\n');

    const liveMatches = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.winner_team_id,
        mb.block_name,
        mb.phase
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
        AND mb.phase = 'preliminary'
        AND ml.team1_id IS NOT NULL
        AND ml.team2_id IS NOT NULL
    `, [TOURNAMENT_ID]);

    console.log(`対象試合数（予選のみ）: ${liveMatches.rows.length}\n`);

    let liveUpdatedCount = 0;
    for (const match of liveMatches.rows) {
      // team1のtournament_team_idをブロック情報で取得
      let team1TournamentTeamId = null;
      if (match.team1_id) {
        const team1Result = await db.execute(`
          SELECT tournament_team_id
          FROM t_tournament_teams
          WHERE tournament_id = ?
            AND team_id = ?
            AND assigned_block = ?
          LIMIT 1
        `, [TOURNAMENT_ID, match.team1_id, match.block_name]);

        if (team1Result.rows.length > 0) {
          team1TournamentTeamId = team1Result.rows[0].tournament_team_id;
        } else {
          console.log(`⚠️  [${match.match_code}] team1 (${match.team1_id}) のtournament_team_idが見つかりません（block: ${match.block_name}）`);
        }
      }

      // team2のtournament_team_idをブロック情報で取得
      let team2TournamentTeamId = null;
      if (match.team2_id) {
        const team2Result = await db.execute(`
          SELECT tournament_team_id
          FROM t_tournament_teams
          WHERE tournament_id = ?
            AND team_id = ?
            AND assigned_block = ?
          LIMIT 1
        `, [TOURNAMENT_ID, match.team2_id, match.block_name]);

        if (team2Result.rows.length > 0) {
          team2TournamentTeamId = team2Result.rows[0].tournament_team_id;
        } else {
          console.log(`⚠️  [${match.match_code}] team2 (${match.team2_id}) のtournament_team_idが見つかりません（block: ${match.block_name}）`);
        }
      }

      // winnerのtournament_team_idを取得
      let winnerTournamentTeamId = null;
      if (match.winner_team_id) {
        if (match.winner_team_id === match.team1_id) {
          winnerTournamentTeamId = team1TournamentTeamId;
        } else if (match.winner_team_id === match.team2_id) {
          winnerTournamentTeamId = team2TournamentTeamId;
        }
      }

      // UPDATEを実行
      await db.execute(`
        UPDATE t_matches_live
        SET team1_tournament_team_id = ?,
            team2_tournament_team_id = ?,
            winner_tournament_team_id = ?,
            updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `, [team1TournamentTeamId, team2TournamentTeamId, winnerTournamentTeamId, match.match_id]);

      console.log(`✓ [${match.match_code}] ${match.block_name}ブロック: team1=${team1TournamentTeamId}, team2=${team2TournamentTeamId}, winner=${winnerTournamentTeamId}`);
      liveUpdatedCount++;
    }

    console.log(`\n✅ t_matches_live（予選）: ${liveUpdatedCount}件更新完了\n`);

    // t_matches_finalの修正
    console.log('📋 t_matches_finalの予選試合を修正中...\n');

    const finalMatches = await db.execute(`
      SELECT
        mf.match_id,
        mf.match_code,
        mf.team1_id,
        mf.team2_id,
        mf.winner_team_id,
        mb.block_name,
        mb.phase
      FROM t_matches_final mf
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
        AND mb.phase = 'preliminary'
        AND mf.team1_id IS NOT NULL
        AND mf.team2_id IS NOT NULL
    `, [TOURNAMENT_ID]);

    console.log(`対象試合数（予選のみ）: ${finalMatches.rows.length}\n`);

    let finalUpdatedCount = 0;
    for (const match of finalMatches.rows) {
      // team1のtournament_team_idをブロック情報で取得
      let team1TournamentTeamId = null;
      if (match.team1_id) {
        const team1Result = await db.execute(`
          SELECT tournament_team_id
          FROM t_tournament_teams
          WHERE tournament_id = ?
            AND team_id = ?
            AND assigned_block = ?
          LIMIT 1
        `, [TOURNAMENT_ID, match.team1_id, match.block_name]);

        if (team1Result.rows.length > 0) {
          team1TournamentTeamId = team1Result.rows[0].tournament_team_id;
        }
      }

      // team2のtournament_team_idをブロック情報で取得
      let team2TournamentTeamId = null;
      if (match.team2_id) {
        const team2Result = await db.execute(`
          SELECT tournament_team_id
          FROM t_tournament_teams
          WHERE tournament_id = ?
            AND team_id = ?
            AND assigned_block = ?
          LIMIT 1
        `, [TOURNAMENT_ID, match.team2_id, match.block_name]);

        if (team2Result.rows.length > 0) {
          team2TournamentTeamId = team2Result.rows[0].tournament_team_id;
        }
      }

      // winnerのtournament_team_idを取得
      let winnerTournamentTeamId = null;
      if (match.winner_team_id) {
        if (match.winner_team_id === match.team1_id) {
          winnerTournamentTeamId = team1TournamentTeamId;
        } else if (match.winner_team_id === match.team2_id) {
          winnerTournamentTeamId = team2TournamentTeamId;
        }
      }

      // UPDATEを実行
      await db.execute(`
        UPDATE t_matches_final
        SET team1_tournament_team_id = ?,
            team2_tournament_team_id = ?,
            winner_tournament_team_id = ?,
            updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `, [team1TournamentTeamId, team2TournamentTeamId, winnerTournamentTeamId, match.match_id]);

      console.log(`✓ [${match.match_code}] ${match.block_name}ブロック: team1=${team1TournamentTeamId}, team2=${team2TournamentTeamId}, winner=${winnerTournamentTeamId}`);
      finalUpdatedCount++;
    }

    console.log(`\n✅ t_matches_final（予選）: ${finalUpdatedCount}件更新完了\n`);

    console.log(`\n✅ 部門${TOURNAMENT_ID}の予選試合のtournament_team_id修正が完了しました！\n`);
    console.log(`※ 決勝トーナメントの試合は元のロジックで正しく設定されているため、そのままです。\n`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    db.close();
  }
}

fixTournamentTeamIdsByBlock();
