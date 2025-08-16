#!/usr/bin/env node

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function checkTournamentMatches() {
  console.log('📊 大会3のトーナメント試合状況');
  
  try {
    // 未確定のトーナメント試合をチェック
    const liveMatches = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.team1_scores,
        ml.team2_scores,
        ml.winner_team_id,
        ml.result_status
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 3 AND mb.phase = 'final'
      ORDER BY ml.match_code
    `);

    console.log('\n未確定のトーナメント試合:');
    for (const match of liveMatches.rows) {
      console.log(`  ${match.match_code} (ID: ${match.match_id}): ${match.team1_display_name} vs ${match.team2_display_name}`);
      if (match.team1_scores) {
        console.log(`    結果: ${match.team1_scores}-${match.team2_scores}, 勝者: ${match.winner_team_id}, ステータス: ${match.result_status}`);
      } else {
        console.log(`    未実施`);
      }
    }
    
    // 確定済みのトーナメント試合をチェック
    const finalMatches = await db.execute(`
      SELECT 
        mf.match_code,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        tw.team_name as winner_name
      FROM t_matches_final mf
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
      WHERE mb.tournament_id = 3 AND mb.phase = 'final'
      ORDER BY mf.match_code
    `);

    console.log('\n確定済みのトーナメント試合:');
    for (const match of finalMatches.rows) {
      console.log(`  ${match.match_code}: ${match.team1_scores}-${match.team2_scores} → ${match.winner_name} wins`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

checkTournamentMatches();