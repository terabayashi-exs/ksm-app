#!/usr/bin/env node

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function testTournamentProgression() {
  console.log('🔍 Testing Tournament Progression Logic...\n');
  
  const tournamentId = 3;
  
  try {
    // 1. 確定済みのトーナメント試合を確認
    console.log('1. 確定済みのトーナメント試合:');
    const confirmedMatches = await db.execute(`
      SELECT 
        mf.match_code,
        mf.team1_id,
        mf.team2_id,
        t1.team_name as team1_name,
        t2.team_name as team2_name,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        tw.team_name as winner_name
      FROM t_matches_final mf
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
      LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
      WHERE mb.tournament_id = ? AND mb.phase = 'final'
      ORDER BY mf.match_code
    `, [tournamentId]);
    
    for (const match of confirmedMatches.rows) {
      console.log(`   ${match.match_code}: ${match.team1_name} vs ${match.team2_name} → ${match.winner_name} wins (${match.team1_scores}-${match.team2_scores})`);
    }
    
    // 2. 現在のT5試合の状態を確認
    console.log('\n2. 現在のT5試合の状態:');
    const t5Match = await db.execute(`
      SELECT 
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.match_code = 'T5'
    `, [tournamentId]);
    
    if (t5Match.rows.length > 0) {
      const match = t5Match.rows[0];
      console.log(`   T5: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`   T5 team_ids: ${match.team1_id} vs ${match.team2_id}`);
    } else {
      console.log('   T5試合が見つかりません');
    }
    
    // 3. m_match_templatesからT5の期待される設定を確認
    console.log('\n3. m_match_templatesからT5の期待される設定:');
    const t5Template = await db.execute(`
      SELECT 
        match_code,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name
      FROM m_match_templates
      WHERE format_id = (SELECT format_id FROM t_tournaments WHERE tournament_id = ?)
      AND match_code = 'T5'
    `, [tournamentId]);
    
    if (t5Template.rows.length > 0) {
      const template = t5Template.rows[0];
      console.log(`   T5 template: team1_source="${template.team1_source}", team2_source="${template.team2_source}"`);
      console.log(`   T5 template names: "${template.team1_display_name}" vs "${template.team2_display_name}"`);
    }
    
    // 4. T1とT2の依存関係をチェック
    console.log('\n4. T1とT2の依存関係をチェック:');
    const dependentMatches = await db.execute(`
      SELECT 
        match_code,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name
      FROM m_match_templates
      WHERE format_id = (SELECT format_id FROM t_tournaments WHERE tournament_id = ?)
      AND (team1_source = 'T1_winner' OR team1_source = 'T2_winner' OR team2_source = 'T1_winner' OR team2_source = 'T2_winner')
    `, [tournamentId]);
    
    for (const match of dependentMatches.rows) {
      console.log(`   ${match.match_code}: team1_source="${match.team1_source}", team2_source="${match.team2_source}"`);
      console.log(`      → "${match.team1_display_name}" vs "${match.team2_display_name}"`);
    }
    
    // 5. 手動でトーナメント進出処理をテスト
    console.log('\n5. 手動でトーナメント進出処理をテスト:');
    
    // T1の勝者を取得
    const t1Winner = confirmedMatches.rows.find(m => m.match_code === 'T1');
    const t2Winner = confirmedMatches.rows.find(m => m.match_code === 'T2');
    
    if (t1Winner && t2Winner) {
      console.log(`   T1 winner: ${t1Winner.winner_name} (ID: ${t1Winner.winner_team_id})`);
      console.log(`   T2 winner: ${t2Winner.winner_name} (ID: ${t2Winner.winner_team_id})`);
      
      // T5のチーム名を更新
      console.log('\n   T5のチーム名を更新中...');
      
      // T5のmatch_idを取得
      const t5MatchId = t5Match.rows[0]?.match_id;
      if (t5MatchId) {
        await db.execute(`
          UPDATE t_matches_live 
          SET 
            team1_id = ?, 
            team1_display_name = ?,
            team2_id = ?,
            team2_display_name = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [
          t1Winner.winner_team_id,
          t1Winner.winner_name,
          t2Winner.winner_team_id,
          t2Winner.winner_name,
          t5MatchId
        ]);
        
        console.log('   ✅ T5のチーム名を更新しました');
        
        // 更新後の状態を確認
        const updatedT5 = await db.execute(`
          SELECT 
            ml.match_code,
            ml.team1_display_name,
            ml.team2_display_name
          FROM t_matches_live ml
          INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          WHERE mb.tournament_id = ? AND ml.match_code = 'T5'
        `, [tournamentId]);
        
        if (updatedT5.rows.length > 0) {
          const match = updatedT5.rows[0];
          console.log(`   更新後のT5: ${match.team1_display_name} vs ${match.team2_display_name}`);
        }
      }
    } else {
      console.log('   T1またはT2の勝者が見つかりません');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

testTournamentProgression();