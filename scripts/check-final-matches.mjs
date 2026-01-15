import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function checkFinalMatches(tournamentId) {
  console.log(`\n=== 大会 ${tournamentId} の決勝トーナメント試合チェック ===\n`);

  // 決勝トーナメントの試合を取得
  const matchesResult = await db.execute(`
    SELECT
      ml.match_id,
      ml.match_code,
      ml.team1_id,
      ml.team2_id,
      ml.team1_tournament_team_id,
      ml.team2_tournament_team_id,
      ml.team1_display_name,
      ml.team2_display_name,
      mf.winner_team_id,
      mf.winner_tournament_team_id,
      CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
    FROM t_matches_live ml
    LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
      AND mb.phase = 'final'
    ORDER BY ml.match_code
  `, [tournamentId]);

  console.log(`試合数: ${matchesResult.rows.length}\n`);

  for (const match of matchesResult.rows) {
    console.log(`📋 ${match.match_code} (${match.is_confirmed ? '✅確定' : '⏳未確定'})`);
    console.log(`   Team1: ${match.team1_display_name}`);
    console.log(`     - team1_id: ${match.team1_id}`);
    console.log(`     - team1_tournament_team_id: ${match.team1_tournament_team_id || 'NULL'}`);
    console.log(`   Team2: ${match.team2_display_name}`);
    console.log(`     - team2_id: ${match.team2_id}`);
    console.log(`     - team2_tournament_team_id: ${match.team2_tournament_team_id || 'NULL'}`);

    if (match.is_confirmed) {
      console.log(`   勝者: ${match.winner_team_id}`);
      console.log(`   winner_tournament_team_id: ${match.winner_tournament_team_id || 'NULL'}`);
    }
    console.log('');
  }

  // 実チームのカウント
  const realTeamsSet = new Set();
  matchesResult.rows.forEach(row => {
    if (row.team1_id && !String(row.team1_id).includes('_winner') && !String(row.team1_id).includes('_loser')) {
      if (row.team1_tournament_team_id) {
        realTeamsSet.add(row.team1_id);
      }
    }
    if (row.team2_id && !String(row.team2_id).includes('_winner') && !String(row.team2_id).includes('_loser')) {
      if (row.team2_tournament_team_id) {
        realTeamsSet.add(row.team2_id);
      }
    }
  });

  console.log(`\ntournament_team_idが設定されている実チーム数: ${realTeamsSet.size}`);
  console.log(`実チーム: ${Array.from(realTeamsSet).join(', ')}`);
}

const tournamentId = process.argv[2];
if (!tournamentId) {
  console.error('使用方法: node scripts/check-final-matches.mjs <tournament_id>');
  process.exit(1);
}

checkFinalMatches(parseInt(tournamentId))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
