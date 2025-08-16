#!/usr/bin/env node

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIgoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function manualProgressionTest() {
  console.log('🧪 Manual Tournament Progression Test...\n');
  
  const tournamentId = 3;
  
  try {
    // まずT6をリセット（テスト用）
    console.log('1. T6をリセット中...');
    await db.execute(`
      UPDATE t_matches_live 
      SET 
        team1_id = 'T3_winner', 
        team1_display_name = 'T3の勝者',
        team2_id = 'T4_winner',
        team2_display_name = 'T4の勝者',
        updated_at = datetime('now', '+9 hours')
      WHERE match_id = 62
    `);
    console.log('   ✅ T6をリセットしました');
    
    // リセット後の状態を確認
    const resetT6 = await db.execute(`
      SELECT team1_display_name, team2_display_name
      FROM t_matches_live
      WHERE match_id = 62
    `);
    console.log('   リセット後のT6:', resetT6.rows[0]);
    
    // T3の進出処理をシミュレート
    console.log('\n2. T3の進出処理をシミュレート...');
    
    // T3の勝者を取得
    const t3Winner = await db.execute(`
      SELECT mf.winner_team_id, t.team_omission, t.team_name
      FROM t_matches_final mf
      INNER JOIN m_teams t ON mf.winner_team_id = t.team_id
      WHERE mf.match_code = 'T3'
    `);
    
    if (t3Winner.rows.length > 0) {
      const winnerData = t3Winner.rows[0];
      const winnerId = winnerData.winner_team_id;
      const winnerName = winnerData.team_omission || winnerData.team_name;
      
      console.log(`   T3 winner: ${winnerName} (ID: ${winnerId})`);
      
      // T6のteam1を更新
      await db.execute(`
        UPDATE t_matches_live 
        SET 
          team1_id = ?, 
          team1_display_name = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE match_id = 62
      `, [winnerId, winnerName]);
      
      console.log('   ✅ T6のteam1を更新しました');
    }
    
    // T4の進出処理をシミュレート
    console.log('\n3. T4の進出処理をシミュレート...');
    
    const t4Winner = await db.execute(`
      SELECT mf.winner_team_id, t.team_omission, t.team_name
      FROM t_matches_final mf
      INNER JOIN m_teams t ON mf.winner_team_id = t.team_id
      WHERE mf.match_code = 'T4'
    `);
    
    if (t4Winner.rows.length > 0) {
      const winnerData = t4Winner.rows[0];
      const winnerId = winnerData.winner_team_id;
      const winnerName = winnerData.team_omission || winnerData.team_name;
      
      console.log(`   T4 winner: ${winnerName} (ID: ${winnerId})`);
      
      // T6のteam2を更新
      await db.execute(`
        UPDATE t_matches_live 
        SET 
          team2_id = ?, 
          team2_display_name = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE match_id = 62
      `, [winnerId, winnerName]);
      
      console.log('   ✅ T6のteam2を更新しました');
    }
    
    // 最終的な状態を確認
    console.log('\n4. 最終的なT6の状態:');
    const finalT6 = await db.execute(`
      SELECT team1_display_name, team2_display_name
      FROM t_matches_live
      WHERE match_id = 62
    `);
    console.log('   最終T6:', finalT6.rows[0]);
    
    console.log('\n✅ Manual progression test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

manualProgressionTest();