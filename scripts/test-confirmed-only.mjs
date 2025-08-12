#!/usr/bin/env node

// 確定済み試合のみ表示されるかテスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testConfirmedOnlyDisplay() {
  try {
    console.log('🔍 確定済み試合のみ表示のテスト実行中...\n');
    
    // 現在の試合状況確認
    console.log('1️⃣ 現在の試合状況:');
    
    // 確定済み試合
    const confirmedMatches = await client.execute(`
      SELECT mf.match_code, mf.team1_scores, mf.team2_scores, mf.winner_team_id
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 3
      ORDER BY mf.match_code
    `);
    
    console.log(`   ✅ 確定済み試合: ${confirmedMatches.rows.length}件`);
    confirmedMatches.rows.forEach(row => {
      console.log(`     ${row.match_code}: ${row.team1_scores}vs${row.team2_scores} (勝者: ${row.winner_team_id})`);
    });
    
    // 未確定試合（スコア入力済み）
    const pendingMatches = await client.execute(`
      SELECT ml.match_code, ml.team1_scores, ml.team2_scores, ml.winner_team_id
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = 3 
        AND ml.team1_scores IS NOT NULL 
        AND ml.team2_scores IS NOT NULL
        AND mf.match_id IS NULL
      ORDER BY ml.match_code
    `);
    
    console.log(`   ⏳ 未確定試合（スコア入力済み）: ${pendingMatches.rows.length}件`);
    pendingMatches.rows.forEach(row => {
      console.log(`     ${row.match_code}: ${row.team1_scores}vs${row.team2_scores} (勝者: ${row.winner_team_id}) ← これらは戦績表でスコア表示されない`);
    });
    
    // 戦績表APIをテスト
    console.log('\n2️⃣ 戦績表APIテスト:');
    try {
      const response = await fetch('http://localhost:3000/api/tournaments/3/results');
      if (response.ok) {
        const resultsData = await response.json();
        if (resultsData.success && resultsData.data.length > 0) {
          const blockA = resultsData.data.find(block => block.block_name === 'A');
          if (blockA && blockA.match_matrix) {
            console.log('   ✅ Block A の戦績表データ取得成功');
            
            // マトリックス内容を確認
            const teams = Object.keys(blockA.match_matrix);
            console.log(`   📊 チーム数: ${teams.length}`);
            
            let confirmedResults = 0;
            let pendingCodes = 0;
            
            for (const team1 of teams) {
              for (const team2 of teams) {
                if (team1 !== team2 && blockA.match_matrix[team1][team2]) {
                  const cell = blockA.match_matrix[team1][team2];
                  if (cell.score && cell.score !== '-') {
                    if (cell.score.includes('〇') || cell.score.includes('●') || cell.score.includes('△')) {
                      confirmedResults++;
                      console.log(`     ✅ 確定済み結果: ${cell.score}`);
                    } else if (cell.score.match(/^[A-Z]\\d+$/)) {
                      pendingCodes++;
                      console.log(`     ⏳ 未確定試合コード: ${cell.score}`);
                    }
                  }
                }
              }
            }
            
            console.log(`\\n   📈 結果サマリー:`);
            console.log(`     確定済み結果表示: ${confirmedResults}件`);
            console.log(`     未確定試合コード表示: ${pendingCodes}件`);
            
            if (confirmedResults === confirmedMatches.rows.length * 2) { // 各試合は2セル（両チーム視点）
              console.log('     ✅ 確定済み試合のみ正しく表示されています');
            } else {
              console.log('     ⚠️ 表示件数が期待値と異なります');
            }
          }
        }
      } else {
        console.log(`   ❌ 戦績表API エラー: ${response.status}`);
      }
    } catch (apiError) {
      console.log(`   ⚠️ 戦績表API接続失敗: ${apiError.message}`);
    }
    
    console.log('\\n🎯 修正内容の確認:');
    console.log('   - 確定済み試合（t_matches_final）のみスコア表示');
    console.log('   - 未確定試合（t_matches_live）は試合コードのみ表示');
    console.log('   - 順位表計算は確定済み試合のみ対象');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

testConfirmedOnlyDisplay();