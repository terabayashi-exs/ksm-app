const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

// Tursoクライアントの作成
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkMatchTemplatesTimes() {
  try {
    console.log('=== m_match_templatesのsuggest_start_timeを確認 ===\n');

    // フォーマットID:18のテンプレートを取得
    const templates = await client.execute(`
      SELECT 
        match_code,
        match_type,
        phase,
        round_name,
        suggested_start_time,
        day_number
      FROM m_match_templates
      WHERE format_id = 18
      ORDER BY day_number, execution_priority, match_number
    `);

    console.log(`フォーマットID:18のテンプレート数: ${templates.rows.length}件\n`);

    // テンプレート情報を表示
    console.log('予選ブロック:');
    templates.rows.filter(row => row.phase === 'preliminary').forEach(row => {
      console.log(`  ${row.match_code}: ${row.suggested_start_time || '未設定'}`);
    });

    console.log('\n決勝トーナメント:');
    templates.rows.filter(row => row.phase === 'final').forEach(row => {
      console.log(`  ${row.match_code}: ${row.suggested_start_time || '未設定'} (${row.round_name})`);
    });

    // 各大会の現在の試合時間も確認
    const tournamentIds = [43, 24, 25, 28, 29];
    
    for (const tournamentId of tournamentIds) {
      console.log(`\n=== 大会ID:${tournamentId}の現在の試合時間（サンプル5件） ===`);
      
      // 大会情報を取得
      const tournament = await client.execute(`
        SELECT tournament_name, format_id
        FROM t_tournaments
        WHERE tournament_id = ?
      `, [tournamentId]);

      if (tournament.rows.length === 0) {
        console.log(`大会ID:${tournamentId}が見つかりません。`);
        continue;
      }

      console.log(`大会名: ${tournament.rows[0].tournament_name}`);
      console.log(`フォーマットID: ${tournament.rows[0].format_id}`);

      const matches = await client.execute(`
        SELECT 
          ml.match_code,
          ml.start_time,
          mb.phase
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
        ORDER BY ml.match_number
        LIMIT 5
      `, [tournamentId]);

      matches.rows.forEach(row => {
        console.log(`  ${row.match_code}: ${row.start_time} (${row.phase})`);
      });
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

checkMatchTemplatesTimes();