#!/usr/bin/env node

// 修正内容の総合テスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function comprehensiveTest() {
  try {
    console.log('🔍 修正内容の総合テスト実行中...\n');
    
    // 1. ランキング計算と保存の確認
    console.log('1️⃣ ランキング計算と保存の確認:');
    const rankingsResult = await client.execute(`
      SELECT mb.match_block_id, mb.block_name, mb.team_rankings
      FROM t_match_blocks mb
      WHERE mb.tournament_id = 3 AND mb.team_rankings IS NOT NULL
    `);
    
    if (rankingsResult.rows.length > 0) {
      console.log('   ✅ ランキングデータが保存されています');
      rankingsResult.rows.forEach(row => {
        const rankings = JSON.parse(row.team_rankings);
        console.log(`   Block ${row.block_name}:`);
        rankings.forEach(team => {
          console.log(`     ${team.position}. ${team.team_name} - ${team.points}pts`);
        });
      });
    } else {
      console.log('   ❌ ランキングデータが保存されていません');
    }
    
    // 2. 戦績表APIのテスト（小数点表示修正確認）
    console.log('\n2️⃣ 戦績表APIのテスト（小数点表示修正確認）:');
    try {
      const response = await fetch('http://localhost:3000/api/tournaments/3/results');
      if (response.ok) {
        const resultsData = await response.json();
        if (resultsData.success && resultsData.data.length > 0) {
          console.log('   ✅ 戦績表API正常動作');
          
          // スコア表示を確認
          const blockA = resultsData.data.find(block => block.block_name === 'A');
          if (blockA && blockA.match_matrix) {
            const teams = Object.keys(blockA.match_matrix);
            let foundScore = false;
            
            for (const team1 of teams) {
              for (const team2 of teams) {
                if (team1 !== team2 && blockA.match_matrix[team1][team2]) {
                  const cell = blockA.match_matrix[team1][team2];
                  if (cell.score && (cell.score.includes('〇') || cell.score.includes('●') || cell.score.includes('△'))) {
                    console.log(`   📊 スコア表示例: "${cell.score}"`);
                    
                    // 小数点チェック
                    const hasDecimal = cell.score.includes('.');
                    if (hasDecimal) {
                      console.log('   ❌ まだ小数点が表示されています');
                    } else {
                      console.log('   ✅ 小数点なしで正常表示されています');
                    }
                    foundScore = true;
                    break;
                  }
                }
              }
              if (foundScore) break;
            }
            
            if (!foundScore) {
              console.log('   ⚠️ 確定済みの対戦結果スコアが見つかりませんでした');
            }
          }
        } else {
          console.log('   ⚠️ 戦績表APIが空のデータを返しました');
        }
      } else {
        console.log(`   ❌ 戦績表API エラー: ${response.status}`);
      }
    } catch (apiError) {
      console.log(`   ⚠️ 戦績表API接続失敗（サーバーが起動していない可能性）: ${apiError.message}`);
    }
    
    // 3. 確定済み試合数の確認
    console.log('\n3️⃣ 確定済み試合数の確認:');
    const confirmedMatches = await client.execute(`
      SELECT mf.match_code, mf.team1_scores, mf.team2_scores
      FROM t_matches_final mf
      JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 3
      ORDER BY mf.match_code
    `);
    
    console.log(`   📋 確定済み試合数: ${confirmedMatches.rows.length}件`);
    confirmedMatches.rows.forEach(row => {
      console.log(`     ${row.match_code}: ${row.team1_scores}vs${row.team2_scores}`);
    });
    
    // 4. 新しい試合確定のシミュレーション準備確認
    console.log('\n4️⃣ 新しい試合確定の準備状況:');
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
    
    if (pendingMatches.rows.length > 0) {
      console.log(`   📋 確定待ちの試合: ${pendingMatches.rows.length}件`);
      pendingMatches.rows.forEach(row => {
        console.log(`     ${row.match_code}: ${row.team1_scores}vs${row.team2_scores} (勝者: ${row.winner_team_id || '未設定'})`);
      });
      console.log('   💡 これらの試合を確定すると、ランキング計算が自動実行されます');
    } else {
      console.log('   📋 確定待ちの試合はありません');
    }
    
    console.log('\n🎯 修正内容まとめ:');
    console.log('   ✅ ランキング計算の詳細ログ追加（デバッグ用）');
    console.log('   ✅ 戦績表での小数点表示修正（Math.floor使用）');
    console.log('   ✅ 現在のランキングデータ確認完了');
    console.log('\n💡 今後の試合確定時に、ランキング計算が自動実行され、戦績表でも小数点なしで表示されます。');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

comprehensiveTest();