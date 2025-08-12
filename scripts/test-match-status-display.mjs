#!/usr/bin/env node

// 試合状態表示機能のテスト
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function testMatchStatusDisplay() {
  try {
    console.log('🧪 試合状態表示機能のテスト...\n');
    
    const matchBlockId = 15; // Bブロック
    const tournamentId = 3;
    
    // 1. 修正後のクエリで試合データを取得
    console.log('1️⃣ 修正後のクエリで試合データ取得:');
    const matchesResult = await client.execute(`
      SELECT 
        ml.match_id,
        ml.match_block_id,
        ml.team1_id,
        ml.team2_id,
        ml.match_code,
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
      WHERE ml.match_block_id = ?
      AND ml.team1_id IS NOT NULL 
      AND ml.team2_id IS NOT NULL
      ORDER BY ml.match_code
    `, [matchBlockId]);

    console.log(`   Bブロック試合データ: ${matchesResult.rows.length}件`);
    
    // 2. 各試合の表示内容をシミュレート
    console.log('\n2️⃣ 各試合の表示内容シミュレート:');
    
    matchesResult.rows.forEach(match => {
      const isConfirmed = Boolean(match.is_confirmed);
      const hasGoals = match.team1_goals !== null && match.team2_goals !== null;
      
      console.log(`\n  📋 ${match.match_code}:`);
      console.log(`    確定状態: ${isConfirmed}`);
      console.log(`    試合状態: ${match.match_status || '未設定'}`);
      console.log(`    finalスコア: ${match.team1_goals || 'null'}-${match.team2_goals || 'null'}`);
      
      // 表示ロジックのシミュレート
      if (!isConfirmed || !hasGoals) {
        let displayText = match.match_code; // デフォルトは試合コード
        
        // 試合状態に応じて表示テキストを決定
        switch (match.match_status) {
          case 'scheduled':
            displayText = '未実施';
            break;
          case 'ongoing':
            displayText = '試合中';
            break;
          case 'completed':
            displayText = '試合完了';
            break;
          default:
            displayText = match.match_code; // 状態不明の場合は試合コード
        }
        
        console.log(`    → 表示内容: "${displayText}"`);
        
        // 色分けの説明
        if (displayText === '未実施') {
          console.log(`    → 色: グレー (通常)`);
        } else if (displayText === '試合中') {
          console.log(`    → 色: オレンジ (点滅)`);
        } else if (displayText === '試合完了') {
          console.log(`    → 色: パープル (確定待ち)`);
        } else {
          console.log(`    → 色: グレー (試合コード)`);
        }
        
      } else {
        const team1Goals = match.team1_goals || 0;
        const team2Goals = match.team2_goals || 0;
        console.log(`    → 表示内容: "${team1Goals}-${team2Goals}" (確定済みスコア)`);
        console.log(`    → 色: 勝敗に応じた色分け`);
      }
    });
    
    // 3. チーム情報取得
    console.log('\n3️⃣ チーム情報取得:');
    const teamsResult = await client.execute(`
      SELECT DISTINCT
        tt.team_id,
        t.team_name,
        t.team_omission
      FROM t_tournament_teams tt
      JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ?
      AND tt.assigned_block = (
        SELECT block_name 
        FROM t_match_blocks 
        WHERE match_block_id = ?
      )
      ORDER BY t.team_name
    `, [tournamentId, matchBlockId]);

    const teams = teamsResult.rows.map(row => ({
      team_id: row.team_id,
      team_name: row.team_name,
      team_omission: row.team_omission || undefined,
      display_name: row.team_omission || row.team_name
    }));

    console.log(`   Bブロックチーム: ${teams.length}件`);
    teams.forEach(team => {
      console.log(`     ${team.team_id}: ${team.display_name}`);
    });
    
    // 4. 実際のマトリックス表示例
    console.log('\n4️⃣ 戦績表マトリックス表示例:');
    console.log('   修正後の表示:');
    console.log('     B1: "試合完了" (紫色)');
    console.log('     B2-B6: "未実施" (グレー)');
    console.log('');
    console.log('   今後の表示パターン:');
    console.log('     試合開始前: "未実施"');
    console.log('     試合進行中: "試合中" (オレンジ・点滅)');
    console.log('     結果入力完了・未確定: "試合完了" (紫色)');
    console.log('     結果確定済み: "4-2" (実際のスコア・勝敗色分け)');
    
    console.log('\n✅ 試合状態表示機能テスト完了');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

testMatchStatusDisplay();