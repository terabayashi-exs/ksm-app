import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

(async () => {
  console.log('=== フォーマット20のテンプレート構成 ===');
  const templates = await db.execute(`
    SELECT phase, block_name, day_number, COUNT(*) as count
    FROM m_match_templates
    WHERE format_id = 20
    GROUP BY phase, block_name, day_number
    ORDER BY phase, day_number, block_name
  `);

  templates.rows.forEach(row => {
    console.log(`  Phase: ${row.phase}, Block: ${row.block_name}, Day: ${row.day_number}, 試合数: ${row.count}`);
  });

  console.log('\n=== 部門86の日程情報 ===');
  const tournament = await db.execute('SELECT tournament_id, tournament_dates, event_start_date, event_end_date FROM t_tournaments WHERE tournament_id = 86');
  console.log('  tournament_dates:', tournament.rows[0].tournament_dates);
  console.log('  event_start_date:', tournament.rows[0].event_start_date);
  console.log('  event_end_date:', tournament.rows[0].event_end_date);

  console.log('\n=== 作成された試合データ ===');
  const matches = await db.execute(`
    SELECT mb.block_name, mb.phase, ml.tournament_date, COUNT(*) as count
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = 86
    GROUP BY mb.block_name, mb.phase, ml.tournament_date
    ORDER BY mb.phase, ml.tournament_date, mb.block_name
  `);

  matches.rows.forEach(row => {
    console.log(`  Block: ${row.block_name}, Phase: ${row.phase}, Date: ${row.tournament_date}, 試合数: ${row.count}`);
  });
})();
