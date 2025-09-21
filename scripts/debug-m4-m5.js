/**
 * 試合結果表示問題のデバッグスクリプト
 * 
 * 用途:
 * - PKスポーツの試合結果表示が正しくない場合の詳細調査
 * - データベース内のスコア形式とフロントエンド表示の差異確認
 * - 勝者判定ロジックの検証
 * 
 * 使用方法:
 * node scripts/debug-m4-m5.js
 * 
 * 注意:
 * - 大会ID 50のM4, M5専用だが、tournamentIdとmatchCodeを変更すれば他の試合にも対応可能
 */

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function debugM4M5() {
  try {
    console.log('=== 大会ID 50のM4, M5デバッグ ===\n');
    
    // M4とM5の詳細データを取得
    const matchesResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.team1_scores,
        ml.team2_scores,
        ml.winner_team_id,
        ml.match_status as live_match_status,
        -- 確定結果テーブルから情報取得
        mf.team1_scores as final_team1_scores,
        mf.team2_scores as final_team2_scores,
        mf.winner_team_id as final_winner_team_id,
        mf.is_draw as final_is_draw,
        mf.updated_at as confirmed_at,
        -- 実際のチーム名を取得
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = 50 AND (ml.match_code = 'M4' OR ml.match_code = 'M5')
      ORDER BY ml.match_code
    `);
    
    for (const row of matchesResult.rows) {
      console.log(`=== ${row.match_code} ===`);
      console.log(`Team1: ${row.team1_real_name || row.team1_display_name}`);
      console.log(`Team2: ${row.team2_real_name || row.team2_display_name}`);
      console.log(`Live Scores: "${row.team1_scores}" vs "${row.team2_scores}"`);
      console.log(`Final Scores: "${row.final_team1_scores}" vs "${row.final_team2_scores}"`);
      console.log(`Live Winner: ${row.winner_team_id}`);
      console.log(`Final Winner: ${row.final_winner_team_id}`);
      console.log(`Is Confirmed: ${!!row.confirmed_at}`);
      console.log(`Confirmed At: ${row.confirmed_at}`);
      console.log(`Is Draw: ${row.final_is_draw}`);
      console.log('---');
    }
    
    // どんなスコア形式になっているかチェック
    console.log('\n=== スコア解析 ===');
    for (const row of matchesResult.rows) {
      console.log(`\n${row.match_code}:`);
      
      const finalScores1 = row.final_team1_scores;
      const finalScores2 = row.final_team2_scores;
      
      console.log(`Final Team1 (${typeof finalScores1}): "${finalScores1}"`);
      console.log(`Final Team2 (${typeof finalScores2}): "${finalScores2}"`);
      
      // スコア解析
      if (finalScores1 && finalScores2) {
        let team1Scores = [];
        let team2Scores = [];
        
        try {
          // JSON形式チェック
          team1Scores = JSON.parse(finalScores1);
          team2Scores = JSON.parse(finalScores2);
          console.log(`JSON Parse - Team1: [${team1Scores.join(', ')}], Team2: [${team2Scores.join(', ')}]`);
        } catch (error) {
          // カンマ区切りチェック
          if (finalScores1.includes(',')) {
            team1Scores = finalScores1.split(',').map(s => parseInt(s || '0'));
          } else {
            team1Scores = [parseInt(finalScores1 || '0')];
          }
          
          if (finalScores2.includes(',')) {
            team2Scores = finalScores2.split(',').map(s => parseInt(s || '0'));
          } else {
            team2Scores = [parseInt(finalScores2 || '0')];
          }
          console.log(`CSV Parse - Team1: [${team1Scores.join(', ')}], Team2: [${team2Scores.join(', ')}]`);
        }
        
        // PK選手権ルールでの勝者判定
        const regular1 = team1Scores[0] || 0;
        const regular2 = team2Scores[0] || 0;
        const pk1 = team1Scores[1] || 0;
        const pk2 = team2Scores[1] || 0;
        
        console.log(`Regular: ${regular1} vs ${regular2}`);
        console.log(`PK: ${pk1} vs ${pk2}`);
        
        let winner = null;
        if (pk1 > 0 || pk2 > 0) {
          if (pk1 > pk2) winner = row.team1_real_name || row.team1_display_name;
          else if (pk2 > pk1) winner = row.team2_real_name || row.team2_display_name;
          else winner = '引き分け';
        } else {
          if (regular1 > regular2) winner = row.team1_real_name || row.team1_display_name;
          else if (regular2 > regular1) winner = row.team2_real_name || row.team2_display_name;
          else winner = '引き分け';
        }
        
        console.log(`Calculated Winner: ${winner}`);
        console.log(`DB Final Winner: ${row.final_winner_team_id}`);
      }
    }
    
    // API模拟确认状态计算
    console.log('\n=== API疑似計算 ===');
    for (const row of matchesResult.rows) {
      const isConfirmed = !!row.confirmed_at;
      const team1ScoresStr = isConfirmed ? row.final_team1_scores : row.team1_scores;
      const team2ScoresStr = isConfirmed ? row.final_team2_scores : row.team2_scores;
      
      console.log(`\n${row.match_code} API データ:`);
      console.log(`is_confirmed: ${isConfirmed}`);
      console.log(`team1_scores (for display): "${team1ScoresStr}"`);
      console.log(`team2_scores (for display): "${team2ScoresStr}"`);
      console.log(`winner_team_id: ${row.final_winner_team_id || row.winner_team_id}`);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  }
}

debugM4M5();