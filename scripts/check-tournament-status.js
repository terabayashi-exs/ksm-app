// scripts/check-tournament-status.js
import { db } from '../lib/db.js';

async function checkTournamentStatus() {
  try {
    console.log('大会データのステータスを確認します...\n');
    
    const result = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date,
        public_start_date,
        created_at,
        updated_at
      FROM t_tournaments
      WHERE tournament_name IN ('デモ用大会1', 'デモ用大会2')
      ORDER BY tournament_id
    `);
    
    console.log('大会データ:');
    for (const row of result.rows) {
      console.log(`\n=== ${row.tournament_name} (ID: ${row.tournament_id}) ===`);
      console.log('DBステータス:', row.status);
      console.log('募集開始日:', row.recruitment_start_date);
      console.log('募集終了日:', row.recruitment_end_date);
      console.log('大会日程:', row.tournament_dates);
      console.log('公開開始日:', row.public_start_date);
      
      // 日付を解析
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates);
          console.log('大会日程（パース済み）:', dates);
          const sortedDates = Object.values(dates).sort();
          if (sortedDates.length > 0) {
            console.log('開始日:', sortedDates[0]);
            console.log('終了日:', sortedDates[sortedDates.length - 1]);
          }
        } catch (e) {
          console.log('大会日程のパースエラー:', e.message);
        }
      }
    }
    
    console.log('\n\n現在の日時:', new Date().toISOString());
    console.log('今日の日付（日本時間）:', new Date().toLocaleDateString('ja-JP'));
    
    // 進行中の試合もチェック
    console.log('\n\n各大会の進行中試合をチェック...');
    for (const row of result.rows) {
      const matchResult = await db.execute(`
        SELECT COUNT(*) as ongoing_count
        FROM t_match_status ms
        INNER JOIN t_matches_live ml ON ms.match_id = ml.match_id
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
          AND ms.match_status = 'ongoing'
          AND ms.actual_start_time IS NOT NULL
      `, [row.tournament_id]);
      
      console.log(`${row.tournament_name}: 進行中の試合数 = ${matchResult.rows[0]?.ongoing_count || 0}`);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

checkTournamentStatus();