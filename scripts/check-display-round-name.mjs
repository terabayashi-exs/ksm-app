// scripts/check-display-round-name.mjs
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkDisplayRoundName() {
  try {
    console.log('=== display_round_name の値を確認 ===\n');

    // 大会73の試合ブロックを確認
    const result = await db.execute(`
      SELECT
        mb.match_block_id,
        mb.tournament_id,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        COUNT(ml.match_id) as match_count
      FROM t_match_blocks mb
      LEFT JOIN t_matches_live ml ON mb.match_block_id = ml.match_block_id
      WHERE mb.tournament_id = 73
      GROUP BY mb.match_block_id, mb.tournament_id, mb.phase, mb.display_round_name, mb.block_name
      ORDER BY mb.match_block_id
    `);

    console.log(`見つかったブロック数: ${result.rows.length}\n`);

    result.rows.forEach((row, index) => {
      console.log(`--- ブロック ${index + 1} ---`);
      console.log(`match_block_id: ${row.match_block_id}`);
      console.log(`phase: ${row.phase}`);
      console.log(`display_round_name: ${row.display_round_name || '(NULL)'}`);
      console.log(`block_name: ${row.block_name || '(NULL)'}`);
      console.log(`試合数: ${row.match_count}`);
      console.log('');
    });

    // いくつかの試合データも確認
    console.log('\n=== サンプル試合データ ===\n');
    const matchesResult = await db.execute(`
      SELECT
        ml.match_code,
        ml.match_number,
        mb.phase,
        mb.display_round_name,
        mb.block_name
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 73
      ORDER BY ml.match_code
      LIMIT 10
    `);

    matchesResult.rows.forEach((row) => {
      console.log(`${row.match_code}: phase="${row.phase}", display_round_name="${row.display_round_name || 'NULL'}", block_name="${row.block_name || 'NULL'}"`);
    });

  } catch (error) {
    console.error('エラー:', error);
  }
}

checkDisplayRoundName();
