const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

// Tursoクライアントの作成
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkFormat18Times() {
  try {
    console.log('=== フォーマットID:18のテンプレート時間を確認 ===\n');

    // フォーマットID:18のテンプレートを取得
    const templates = await client.execute(`
      SELECT 
        match_code,
        match_type,
        phase,
        round_name,
        team1_display_name,
        team2_display_name,
        day_number,
        start_time
      FROM m_match_templates
      WHERE format_id = 18
      ORDER BY execution_priority, match_number
    `);

    console.log(`フォーマットID:18のテンプレート数: ${templates.rows.length}件\n`);

    // テンプレート情報を表示
    templates.rows.forEach(row => {
      console.log(`試合コード: ${row.match_code}`);
      console.log(`  フェーズ: ${row.phase}`);
      console.log(`  ラウンド: ${row.round_name}`);
      console.log(`  試合タイプ: ${row.match_type}`);
      console.log(`  開始時間: ${row.start_time || '未設定'}`);
      console.log(`  日程: Day ${row.day_number}`);
      console.log('---');
    });

    // 大会ID:43の現在の試合時間も確認
    console.log('\n=== 大会ID:43の現在の試合時間 ===\n');
    const matches = await client.execute(`
      SELECT 
        ml.match_code,
        ml.start_time,
        ml.tournament_date,
        mb.phase,
        mb.block_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 43
      ORDER BY ml.match_number
      LIMIT 10
    `);

    matches.rows.forEach(row => {
      console.log(`${row.match_code}: ${row.start_time} (${row.phase} - ${row.block_name || '決勝'})`);
    });

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

checkFormat18Times();