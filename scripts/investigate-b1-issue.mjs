#!/usr/bin/env node

// B1試合の詳細調査
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function investigateB1Issue() {
  try {
    console.log('🔍 B1試合の詳細調査...\n');
    
    // 1. B1試合の詳細状況
    const b1Details = await client.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.team1_scores,
        ml.team2_scores,
        ml.winner_team_id,
        mf.match_id as final_match_id,
        mf.team1_scores as final_team1_scores,
        mf.team2_scores as final_team2_scores,
        mf.winner_team_id as final_winner,
        ms.match_status,
        ms.current_period
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_code = 'B1'
    `);
    
    console.log(`B1試合データ: ${b1Details.rows.length}件`);
    
    if (b1Details.rows.length > 0) {
      const match = b1Details.rows[0];
      console.log('📋 B1試合の詳細:');
      console.log(`  試合ID: ${match.match_id}`);
      console.log(`  対戦: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`  チームID: ${match.team1_id} vs ${match.team2_id}`);
      console.log(`  liveスコア: ${match.team1_scores || 0}-${match.team2_scores || 0}`);
      console.log(`  live勝者: ${match.winner_team_id || 'なし'}`);
      console.log(`  finalスコア: ${match.final_team1_scores || 'null'}-${match.final_team2_scores || 'null'}`);
      console.log(`  final勝者: ${match.final_winner || 'なし'}`);
      console.log(`  確定済み: ${match.final_match_id ? 'Yes' : 'No'}`);
      console.log(`  試合状態: ${match.match_status || 'なし'}`);
      console.log(`  現在ピリオド: ${match.current_period || 'なし'}`);
    }
    
    // 2. 戦績表データ取得ロジックのテスト
    console.log(`\n🔍 戦績表データ取得ロジックのテスト:`);
    const resultsQuery = await client.execute(`
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
        ms.match_status,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      WHERE ml.match_block_id = 15
      AND ml.team1_id IS NOT NULL 
      AND ml.team2_id IS NOT NULL
      ORDER BY ml.match_code
    `);
    
    console.log(`Bブロック試合データ: ${resultsQuery.rows.length}件`);
    resultsQuery.rows.forEach(match => {
      const status = match.is_confirmed ? '確定済み' : '未確定';
      const liveScore = `${match.live_team1_scores || 0}-${match.live_team2_scores || 0}`;
      const finalScore = match.is_confirmed ? `${match.team1_goals || 0}-${match.team2_goals || 0}` : 'スコアなし';
      const matchStatus = match.match_status || '状態なし';
      console.log(`  ${match.match_code}: live:${liveScore}, final:${finalScore} [${status}] 状態:${matchStatus}`);
    });
    
    // 3. 現在の戦績表表示がどうなっているかをシミュレート
    console.log(`\n🎯 現在の戦績表表示シミュレート:`);
    
    const b1Match = resultsQuery.rows.find(m => m.match_code === 'B1');
    if (b1Match) {
      console.log(`📊 B1試合のマトリックス表示:`);
      console.log(`  確定状態: ${b1Match.is_confirmed}`);
      const hasGoals = b1Match.team1_goals !== null && b1Match.team2_goals !== null;
      console.log(`  final スコア有無: ${hasGoals}`);
      console.log(`  試合状態: ${b1Match.match_status || '未設定'}`);
      
      // match-results-calculator.tsのロジック（229行付近）を再現
      const isConfirmed = Boolean(b1Match.is_confirmed);
      
      if (!isConfirmed || !hasGoals) {
        console.log(`  → 表示内容: "${b1Match.match_code}" (試合コード)`);
        console.log(`  ✅ これが正しい表示`);
      } else {
        const team1Goals = b1Match.team1_goals || 0;
        const team2Goals = b1Match.team2_goals || 0;
        console.log(`  → 表示内容: "${team1Goals}-${team2Goals}" (実際のスコア)`);
        console.log(`  ❌ 確定していないのにスコアが表示される`);
      }
      
      // 問題の確認
      const hasLiveScores = b1Match.live_team1_scores !== null && b1Match.live_team2_scores !== null;
      if (hasLiveScores && !isConfirmed) {
        console.log(`\n⚠️ 問題発見:`);
        console.log(`  - liveスコアが入力されている: ${b1Match.live_team1_scores}-${b1Match.live_team2_scores}`);
        console.log(`  - しかし試合は未確定`);
        console.log(`  - 戦績表でスコアが表示されてしまっている可能性`);
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

investigateB1Issue();