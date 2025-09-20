const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

// Tursoクライアントの作成
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTournamentSettings() {
  try {
    const tournamentIds = [43, 24, 25, 28, 29];
    
    for (const tournamentId of tournamentIds) {
      console.log(`\n=== 大会ID:${tournamentId}の設定情報 ===\n`);

      // 大会基本情報を取得
      const tournament = await client.execute(`
        SELECT 
          tournament_name,
          format_id,
          court_count,
          match_duration_minutes,
          break_duration_minutes,
          start_time,
          tournament_dates
        FROM t_tournaments
        WHERE tournament_id = ?
      `, [tournamentId]);

      if (tournament.rows.length === 0) {
        console.log(`大会ID:${tournamentId}が見つかりません。`);
        continue;
      }

      const data = tournament.rows[0];
      console.log(`大会名: ${data.tournament_name}`);
      console.log(`フォーマットID: ${data.format_id}`);
      console.log(`コート数: ${data.court_count}`);
      console.log(`試合時間: ${data.match_duration_minutes}分`);
      console.log(`休憩時間: ${data.break_duration_minutes}分`);
      console.log(`開始時刻: ${data.start_time}`);
      console.log(`開催日程: ${data.tournament_dates}`);

      // フォーマット情報も確認
      const format = await client.execute(`
        SELECT format_name, target_team_count
        FROM m_tournament_formats
        WHERE format_id = ?
      `, [data.format_id]);

      if (format.rows.length > 0) {
        console.log(`フォーマット名: ${format.rows[0].format_name}`);
        console.log(`対象チーム数: ${format.rows[0].target_team_count}`);
      }

      // 試合数も確認
      const matches = await client.execute(`
        SELECT COUNT(*) as match_count
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      `, [tournamentId]);

      console.log(`試合数: ${matches.rows[0].match_count}`);
      console.log('---');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

checkTournamentSettings();