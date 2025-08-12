#!/usr/bin/env node

// B1試合の戦績表表示状況を詳細確認
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkB1Display() {
  try {
    console.log('🔍 B1試合の戦績表表示状況を詳細確認...\n');
    
    // 実際のクエリを再現
    const matchesResult = await client.execute(`
      SELECT 
        ml.match_id,
        ml.match_block_id,
        ml.team1_id,
        ml.team2_id,
        ml.match_code,
        ml.team1_scores as live_team1_scores,
        ml.team2_scores as live_team2_scores,
        mf.team1_scores as team1_goals,
        mf.team2_scores as team2_goals,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE ml.match_block_id = 15 
      AND ml.team1_id IS NOT NULL 
      AND ml.team2_id IS NOT NULL
      AND ml.match_code = 'B1'
    `);
    
    console.log(`B1試合のクエリ結果: ${matchesResult.rows.length}件`);
    
    if (matchesResult.rows.length > 0) {
      const match = matchesResult.rows[0];
      console.log('B1試合の詳細:');
      console.log(`  match_id: ${match.match_id}`);
      console.log(`  team1_id: ${match.team1_id}`);
      console.log(`  team2_id: ${match.team2_id}`);
      console.log(`  live スコア: ${match.live_team1_scores}-${match.live_team2_scores}`);
      console.log(`  final スコア: ${match.team1_goals || 'null'}-${match.team2_goals || 'null'}`);
      console.log(`  is_confirmed: ${match.is_confirmed}`);
      
      // 戦績表での表示判定
      const isConfirmed = Boolean(match.is_confirmed);
      const hasGoals = match.team1_goals !== null && match.team2_goals !== null;
      
      console.log(`\n戦績表での表示判定:`);
      console.log(`  確定状態: ${isConfirmed}`);
      console.log(`  スコア有無: ${hasGoals}`);
      console.log(`  表示内容: ${!isConfirmed || !hasGoals ? match.match_code + ' (試合コード)' : 'スコア表示'}`);
      
      // チーム情報も確認
      console.log(`\nチーム情報確認:`);
      const teams = await client.execute(`
        SELECT 
          tt.team_id,
          t.team_name,
          t.team_omission
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.team_id IN (?, ?)
      `, [match.team1_id, match.team2_id]);
      
      teams.rows.forEach(team => {
        console.log(`  ${team.team_id}: ${team.team_name} (${team.team_omission || '略称なし'})`);
      });
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

checkB1Display();