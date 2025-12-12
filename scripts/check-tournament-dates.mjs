import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

(async () => {
  console.log('=== 部門86の日程情報 ===');
  const tournament = await db.execute('SELECT tournament_id, tournament_dates FROM t_tournaments WHERE tournament_id = 86');
  console.log('tournament_dates (raw):', tournament.rows[0].tournament_dates);

  const tournamentDates = JSON.parse(tournament.rows[0].tournament_dates || '{}');
  console.log('tournament_dates (parsed):', tournamentDates);
  console.log('dayNumbers:', Object.keys(tournamentDates));

  console.log('\n=== 作成された試合の日付分布 ===');
  const matches = await db.execute(`
    SELECT
      mb.block_name,
      mb.phase,
      ml.tournament_date,
      COUNT(*) as count
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = 86
    GROUP BY mb.block_name, mb.phase, ml.tournament_date
    ORDER BY ml.tournament_date, mb.phase, mb.block_name
  `);

  matches.rows.forEach(row => {
    console.log(`  Date: ${row.tournament_date}, Phase: ${row.phase}, Block: ${row.block_name}, 試合数: ${row.count}`);
  });

  console.log('\n=== テンプレートのday_number設定 ===');
  const templates = await db.execute(`
    SELECT phase, block_name, day_number, COUNT(*) as count
    FROM m_match_templates
    WHERE format_id = 20
    GROUP BY phase, block_name, day_number
    ORDER BY day_number, phase, block_name
  `);

  templates.rows.forEach(row => {
    console.log(`  Day: ${row.day_number}, Phase: ${row.phase}, Block: ${row.block_name}, 試合数: ${row.count}`);
  });
})();
