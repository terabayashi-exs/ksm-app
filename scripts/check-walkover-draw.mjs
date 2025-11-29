#!/usr/bin/env node
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkWalkoverDraw() {
  console.log('=== 不戦引き分け試合の確認 ===\n');

  // 1. C1試合のt_matches_finalデータを確認
  const finalResult = await db.execute(`
    SELECT
      mf.match_id,
      ml.match_code,
      mf.team1_scores,
      mf.team2_scores,
      mf.winner_team_id,
      mf.is_draw,
      mf.is_walkover,
      ml.cancellation_type
    FROM t_matches_final mf
    JOIN t_matches_live ml ON mf.match_id = ml.match_id
    WHERE ml.match_code = 'C1'
  `);

  console.log('【t_matches_final の C1試合データ】');
  if (finalResult.rows.length > 0) {
    const match = finalResult.rows[0];
    console.log(`試合コード: ${match.match_code}`);
    console.log(`team1_scores: ${match.team1_scores}`);
    console.log(`team2_scores: ${match.team2_scores}`);
    console.log(`winner_team_id: ${match.winner_team_id}`);
    console.log(`is_draw: ${match.is_draw}`);
    console.log(`is_walkover: ${match.is_walkover}`);
    console.log(`cancellation_type: ${match.cancellation_type}`);
  } else {
    console.log('C1試合のt_matches_finalデータが見つかりません');
  }

  console.log('\n【Cブロックの team_rankings JSON】');

  // 2. Cブロックのteam_rankingsを確認
  const rankingsResult = await db.execute(`
    SELECT
      mb.block_name,
      mb.team_rankings
    FROM t_match_blocks mb
    JOIN t_matches_live ml ON mb.match_block_id = ml.match_block_id
    WHERE ml.match_code = 'C1'
  `);

  if (rankingsResult.rows.length > 0) {
    const block = rankingsResult.rows[0];
    console.log(`ブロック名: ${block.block_name}`);

    if (block.team_rankings) {
      const rankings = JSON.parse(block.team_rankings);
      console.log('\nチーム順位データ:');
      rankings.forEach(team => {
        console.log(`\n${team.position}位: ${team.team_name}`);
        console.log(`  勝点: ${team.points}, 試合数: ${team.matches_played}`);
        console.log(`  得点: ${team.goals_for}, 失点: ${team.goals_against}, 得失点差: ${team.goal_difference}`);
        console.log(`  ${team.wins}勝 ${team.draws}分 ${team.losses}敗`);
      });
    } else {
      console.log('team_rankingsが空です');
    }
  } else {
    console.log('Cブロックのデータが見つかりません');
  }
}

checkWalkoverDraw()
  .then(() => {
    console.log('\n✓ 確認完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('エラー:', error);
    process.exit(1);
  });
