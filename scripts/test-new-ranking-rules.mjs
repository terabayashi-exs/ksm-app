// scripts/test-new-ranking-rules.mjs
import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// 環境変数を読み込み
config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function testNewRankingRules() {
  try {
    const tournamentId = 3;
    
    console.log('=== 新しい順位決定ルールをテストします ===');
    console.log('大会ID:', tournamentId);
    console.log('新しいルール:');
    console.log('1. 勝点');
    console.log('2. 総得点数');
    console.log('3. 得失点差');
    console.log('4. 直接対決');
    console.log('5. 抽選（チーム名順）');
    console.log('');
    
    // 大会の順位表を再計算するAPIを呼び出し
    console.log('順位表を再計算中...');
    
    const response = await fetch(`http://localhost:3000/api/tournaments/${tournamentId}/update-rankings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=admin' // 簡易認証（実際にはブラウザでログインが必要）
      },
      body: JSON.stringify({ action: 'recalculate_all' })
    });
    
    if (!response.ok) {
      console.log('APIアクセスに失敗しました。ブラウザから試合管理画面の「順位表更新」ボタンを使用してください。');
      console.log('URL: http://localhost:3000/admin/tournaments/3/matches');
      return;
    }
    
    const result = await response.json();
    console.log('API結果:', result.success ? '成功' : '失敗');
    
    // 更新された順位表を確認
    console.log('\n=== 更新後の順位表 ===');
    const standings = await client.execute({
      sql: `
        SELECT 
          match_block_id,
          block_name,
          display_round_name,
          team_rankings
        FROM t_match_blocks 
        WHERE tournament_id = ? AND team_rankings IS NOT NULL
        ORDER BY block_order
      `,
      args: [tournamentId]
    });
    
    standings.rows.forEach((block) => {
      console.log(`\n【${block.display_round_name} ${block.block_name}ブロック】`);
      
      try {
        const rankings = JSON.parse(block.team_rankings);
        rankings.forEach((team, index) => {
          console.log(`${team.position}位: ${team.team_name} (勝点:${team.points}, 得点:${team.goals_for}, 失点:${team.goals_against}, 得失差:${team.goal_difference})`);
        });
      } catch (e) {
        console.log('順位表の解析に失敗:', e.message);
      }
    });
    
    console.log('\n=== テスト完了 ===');
    console.log('戦績表画面で順位が正しく表示されているか確認してください:');
    console.log('URL: http://localhost:3000/public/tournaments/3');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    client.close();
  }
}

testNewRankingRules();