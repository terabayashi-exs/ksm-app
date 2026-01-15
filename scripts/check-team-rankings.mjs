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

async function checkTeamRankings(tournamentId) {
  console.log(`\n=== 大会 ${tournamentId} のteam_rankingsチェック ===\n`);

  // ブロック情報とteam_rankingsを取得
  const blocksResult = await db.execute(`
    SELECT
      match_block_id,
      block_name,
      phase,
      team_rankings
    FROM t_match_blocks
    WHERE tournament_id = ?
    ORDER BY block_order
  `, [tournamentId]);

  console.log(`ブロック数: ${blocksResult.rows.length}\n`);

  for (const block of blocksResult.rows) {
    console.log(`\n📊 ${block.phase} - ${block.block_name}ブロック (ID: ${block.match_block_id})`);
    console.log(`-`.repeat(60));

    if (!block.team_rankings) {
      console.log(`  ⚠️  team_rankingsがNULLです`);
      continue;
    }

    try {
      const rankings = JSON.parse(block.team_rankings);
      console.log(`  ✓ チーム数: ${rankings.length}`);

      if (rankings.length > 0) {
        console.log(`\n  順位表データ（上位5チーム）:`);
        rankings.slice(0, 5).forEach((team, index) => {
          console.log(`    ${index + 1}位: ${team.team_name || team.teamName}`);
          console.log(`          試合数: ${team.matches_played || team.matchesPlayed || 0}`);
          console.log(`          勝点: ${team.points || 0}`);
          console.log(`          勝: ${team.wins || 0} / 引分: ${team.draws || 0} / 負: ${team.losses || 0}`);
          console.log(`          得点: ${team.goals_for || team.goalsFor || 0} / 失点: ${team.goals_against || team.goalsAgainst || 0} / 得失点差: ${team.goal_difference || team.goalDifference || 0}`);
          console.log(`          tournament_team_id: ${team.tournament_team_id || team.tournamentTeamId || 'なし'}`);
        });

        // 全チームが0点かチェック
        const allZeroPoints = rankings.every(team => (team.points || 0) === 0);
        const allZeroMatches = rankings.every(team => (team.matches_played || team.matchesPlayed || 0) === 0);

        if (allZeroPoints) {
          console.log(`\n  ⚠️  全てのチームの勝点が0です`);
        }
        if (allZeroMatches) {
          console.log(`  ⚠️  全てのチームの試合数が0です`);
        }

        if (!allZeroPoints && !allZeroMatches) {
          console.log(`\n  ✅ 正常なデータです`);
        }
      }
    } catch (error) {
      console.log(`  ❌ team_rankingsのパースエラー:`, error.message);
    }
  }
}

const tournamentId = process.argv[2];
if (!tournamentId) {
  console.error('使用方法: node scripts/check-team-rankings.mjs <tournament_id>');
  process.exit(1);
}

checkTeamRankings(parseInt(tournamentId))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
