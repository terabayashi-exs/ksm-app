import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込み
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const client = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

(async () => {
  // 部門94の試合データを確認
  const matches = await client.execute(`
    SELECT
      ml.match_id,
      ml.match_code,
      ml.tournament_date,
      ml.match_number,
      mb.block_name,
      mb.phase,
      mb.display_round_name,
      mt.round_name,
      mt.day_number
    FROM t_matches_live ml
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    LEFT JOIN m_match_templates mt ON mt.format_id = 19 AND mt.match_code = ml.match_code
    WHERE mb.tournament_id = 94
    ORDER BY ml.match_number
  `);

  console.log('部門94の試合データ:');
  console.log('総試合数:', matches.rows.length);
  console.log('');

  // 日付ごとにグループ化
  const byDate = {};
  const byDayNumber = {};

  for (const match of matches.rows) {
    const date = match.tournament_date || 'null';
    const dayNum = match.day_number || 'null';

    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(match);

    if (!byDayNumber[dayNum]) byDayNumber[dayNum] = [];
    byDayNumber[dayNum].push(match);
  }

  console.log('tournament_date別の試合数:');
  for (const date of Object.keys(byDate)) {
    const matchList = byDate[date];
    const blocks = new Set();
    matchList.forEach(m => blocks.add(m.block_name));
    console.log(`  ${date}: ${matchList.length}試合`);
    console.log(`    ブロック: ${Array.from(blocks).join(', ')}`);
  }

  console.log('');
  console.log('day_number別の試合数（テンプレート基準）:');
  for (const dayNum of Object.keys(byDayNumber)) {
    const matchList = byDayNumber[dayNum];
    const blocks = new Set();
    matchList.forEach(m => blocks.add(m.block_name));
    console.log(`  day_number ${dayNum}: ${matchList.length}試合`);
    console.log(`    ブロック: ${Array.from(blocks).join(', ')}`);
  }

  console.log('');
  console.log('1位/2位/3位リーグの詳細:');
  const leagueMatches = matches.rows.filter(m =>
    (m.round_name && (m.round_name.includes('1位') || m.round_name.includes('2位') || m.round_name.includes('3位'))) ||
    (m.display_round_name && (m.display_round_name.includes('1位') || m.display_round_name.includes('2位') || m.display_round_name.includes('3位')))
  );
  console.log(`1位/2位/3位リーグの試合数: ${leagueMatches.length}\n`);
  leagueMatches.forEach(m => {
    console.log(`  ${m.match_code} (display_round_name: ${m.display_round_name}, round_name: ${m.round_name}): tournament_date=${m.tournament_date}, day_number=${m.day_number}`);
  });

  process.exit(0);
})();
