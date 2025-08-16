#!/usr/bin/env node

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: process.env.DATABASE_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

// トーナメント進出ルール取得関数
async function getTournamentProgressionRules(matchCode, tournamentId) {
  try {
    // 該当試合のフォーマットIDを取得
    const formatResult = await db.execute(`
      SELECT t.format_id
      FROM t_tournaments t
      WHERE t.tournament_id = ?
    `, [tournamentId]);
    
    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }
    
    const formatId = formatResult.rows[0].format_id;
    
    // この試合を参照している他の試合を検索
    const winnerPattern = `${matchCode}_winner`;
    const loserPattern = `${matchCode}_loser`;
    
    console.log(`🔍 Searching for matches that reference ${winnerPattern} or ${loserPattern}`);
    
    const dependentMatchesResult = await db.execute(`
      SELECT 
        match_code,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name
      FROM m_match_templates
      WHERE format_id = ?
      AND (team1_source = ? OR team1_source = ? OR team2_source = ? OR team2_source = ?)
    `, [formatId, winnerPattern, loserPattern, winnerPattern, loserPattern]);
    
    console.log(`   Found ${dependentMatchesResult.rows.length} dependent matches`);
    
    const rule = {
      winner_targets: [],
      loser_targets: []
    };
    
    for (const row of dependentMatchesResult.rows) {
      const targetMatchCode = row.match_code;
      const team1Source = row.team1_source;
      const team2Source = row.team2_source;
      
      console.log(`   Checking match ${targetMatchCode}: team1_source=${team1Source}, team2_source=${team2Source}`);
      
      // team1_sourceをチェック
      if (team1Source === winnerPattern) {
        rule.winner_targets.push({
          match_code: targetMatchCode,
          position: 'team1',
          source_pattern: winnerPattern
        });
        console.log(`   ✅ Added winner target: ${targetMatchCode} team1`);
      } else if (team1Source === loserPattern) {
        rule.loser_targets.push({
          match_code: targetMatchCode,
          position: 'team1',
          source_pattern: loserPattern
        });
        console.log(`   ✅ Added loser target: ${targetMatchCode} team1`);
      }
      
      // team2_sourceをチェック
      if (team2Source === winnerPattern) {
        rule.winner_targets.push({
          match_code: targetMatchCode,
          position: 'team2',
          source_pattern: winnerPattern
        });
        console.log(`   ✅ Added winner target: ${targetMatchCode} team2`);
      } else if (team2Source === loserPattern) {
        rule.loser_targets.push({
          match_code: targetMatchCode,
          position: 'team2',
          source_pattern: loserPattern
        });
        console.log(`   ✅ Added loser target: ${targetMatchCode} team2`);
      }
    }
    
    return rule;
    
  } catch (error) {
    console.error(`❌ Error getting progression rules for ${matchCode}:`, error);
    throw error;
  }
}

async function testProgressionSystem() {
  console.log('🧪 Testing Tournament Progression System...\n');
  
  const tournamentId = 3;
  
  try {
    // T3の進出ルールをテスト
    console.log('1. T3の進出ルールをテスト:');
    const t3Rules = await getTournamentProgressionRules('T3', tournamentId);
    console.log('   T3 rules:', JSON.stringify(t3Rules, null, 2));
    
    console.log('\n2. T4の進出ルールをテスト:');
    const t4Rules = await getTournamentProgressionRules('T4', tournamentId);
    console.log('   T4 rules:', JSON.stringify(t4Rules, null, 2));
    
    // T3とT4の勝者を確認
    console.log('\n3. T3とT4の実際の勝者:');
    const winners = await db.execute(`
      SELECT 
        mf.match_code,
        mf.winner_team_id,
        t.team_name,
        t.team_omission
      FROM t_matches_final mf
      INNER JOIN m_teams t ON mf.winner_team_id = t.team_id
      WHERE mf.match_code IN ('T3', 'T4')
      ORDER BY mf.match_code
    `);
    
    for (const winner of winners.rows) {
      const displayName = winner.team_omission || winner.team_name;
      console.log(`   ${winner.match_code}: ${displayName} (ID: ${winner.winner_team_id})`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testProgressionSystem();