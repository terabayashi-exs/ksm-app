// scripts/check-tournament-visibility.js
const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTournamentVisibility() {
  console.log('=== 大会表示状況チェック ===\n');
  
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = jstNow.toISOString().split('T')[0];
  
  console.log(`現在日時（JST）: ${jstNow.toISOString()}`);
  console.log(`今日の日付: ${todayStr}\n`);

  try {
    // 全大会の基本情報を取得
    const allTournaments = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        tournament_dates
      FROM t_tournaments
      ORDER BY created_at DESC
    `);

    console.log(`全大会数: ${allTournaments.rows.length}件\n`);

    // 管理者ダッシュボードでの募集中判定を再現
    const recruitingByDashboard = allTournaments.rows.filter(t => {
      return t.status === 'planning';
    });

    console.log('=== 管理者ダッシュボード: 募集中の大会 ===');
    console.log(`募集中と判定される大会: ${recruitingByDashboard.length}件`);
    recruitingByDashboard.forEach(t => {
      console.log(`- ${t.tournament_name} (ID: ${t.tournament_id})`);
      console.log(`  status: ${t.status}, visibility: ${t.visibility}`);
      console.log(`  public_start_date: ${t.public_start_date}`);
      console.log(`  recruitment: ${t.recruitment_start_date} ~ ${t.recruitment_end_date}`);
    });

    console.log('\n=== TOP画面: 表示される大会 ===');
    
    // TOP画面のフィルタリング条件を再現
    const publicTournaments = allTournaments.rows.filter(t => {
      const visibilityMatch = t.visibility === 'open';
      const publicStartMatch = t.public_start_date <= todayStr;
      return visibilityMatch && publicStartMatch;
    });

    console.log(`公開中の大会: ${publicTournaments.length}件`);
    publicTournaments.forEach(t => {
      console.log(`- ${t.tournament_name} (ID: ${t.tournament_id})`);
      console.log(`  status: ${t.status}, visibility: ${t.visibility}`);
      console.log(`  public_start_date: ${t.public_start_date}`);
      console.log(`  recruitment: ${t.recruitment_start_date} ~ ${t.recruitment_end_date}`);
    });

    // 差分を検出
    console.log('\n=== 差分分析 ===');
    const notShownInTop = recruitingByDashboard.filter(t => 
      !publicTournaments.some(p => p.tournament_id === t.tournament_id)
    );

    if (notShownInTop.length > 0) {
      console.log(`管理者ダッシュボードには表示されるが、TOP画面には表示されない大会: ${notShownInTop.length}件\n`);
      
      notShownInTop.forEach(t => {
        console.log(`大会: ${t.tournament_name} (ID: ${t.tournament_id})`);
        console.log('理由:');
        
        if (t.visibility !== 'open') {
          console.log(`  - visibility が 'open' ではない (現在: ${t.visibility})`);
        }
        
        if (t.public_start_date > todayStr) {
          console.log(`  - public_start_date (${t.public_start_date}) が今日 (${todayStr}) より未来`);
        }
        
        console.log(`  現在の設定:`);
        console.log(`    - status: ${t.status}`);
        console.log(`    - visibility: ${t.visibility}`);
        console.log(`    - public_start_date: ${t.public_start_date}`);
        console.log(`    - recruitment: ${t.recruitment_start_date} ~ ${t.recruitment_end_date}`);
        console.log('');
      });
    } else {
      console.log('差分なし: 全ての募集中大会が適切に表示されています。');
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

checkTournamentVisibility();