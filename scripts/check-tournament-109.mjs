import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL_DEV || process.env.DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN_DEV || process.env.DATABASE_AUTH_TOKEN || '',
});

(async () => {
  const tournamentId = 109;

  // 1. 大会の基本情報を取得
  console.log('\n=== 大会基本情報 ===');
  const tournamentResult = await client.execute(`
    SELECT tournament_id, tournament_name, status, tournament_dates
    FROM t_tournaments
    WHERE tournament_id = ?
  `, [tournamentId]);
  console.log(tournamentResult.rows[0]);

  // 2. 全試合数を取得
  console.log('\n=== 全試合数 ===');
  const totalResult = await client.execute(`
    SELECT COUNT(*) as total_matches
    FROM t_matches_live ml
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
      AND ml.team1_id IS NOT NULL
      AND ml.team2_id IS NOT NULL
  `, [tournamentId]);
  console.log('Total matches:', totalResult.rows[0]);

  // 3. t_matches_finalに登録されている試合数
  console.log('\n=== t_matches_final登録数 ===');
  const finalResult = await client.execute(`
    SELECT COUNT(*) as confirmed_matches
    FROM t_matches_final mf
    INNER JOIN t_matches_live ml ON mf.match_id = ml.match_id
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
  `, [tournamentId]);
  console.log('Confirmed matches:', finalResult.rows[0]);

  // 4. 試合ステータス別の内訳
  console.log('\n=== 試合ステータス別内訳 ===');
  const statusResult = await client.execute(`
    SELECT 
      ml.match_status,
      COUNT(*) as count
    FROM t_matches_live ml
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
      AND ml.team1_id IS NOT NULL
      AND ml.team2_id IS NOT NULL
    GROUP BY ml.match_status
  `, [tournamentId]);
  console.log('Match status breakdown:');
  statusResult.rows.forEach(row => {
    console.log(`  ${row.match_status}: ${row.count}`);
  });

  // 5. t_matches_finalに未登録の試合（中止含む）
  console.log('\n=== t_matches_finalに未登録の試合 ===');
  const unconfirmedResult = await client.execute(`
    SELECT 
      ml.match_id,
      ml.match_number,
      ml.match_status,
      ml.team1_id,
      ml.team2_id
    FROM t_matches_live ml
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    WHERE mb.tournament_id = ?
      AND ml.team1_id IS NOT NULL
      AND ml.team2_id IS NOT NULL
      AND mf.match_id IS NULL
    ORDER BY ml.match_number
  `, [tournamentId]);
  console.log('Unconfirmed matches:', unconfirmedResult.rows.length);
  if (unconfirmedResult.rows.length > 0) {
    unconfirmedResult.rows.forEach(row => {
      console.log(`  Match ${row.match_id} (No.${row.match_number}): status=${row.match_status}, team1=${row.team1_id}, team2=${row.team2_id}`);
    });
  } else {
    console.log('  (すべての試合が確定済み)');
  }

  // 6. 中止試合の一覧
  console.log('\n=== 中止試合の一覧 ===');
  const cancelledResult = await client.execute(`
    SELECT 
      ml.match_id,
      ml.match_number,
      ml.match_status,
      CASE WHEN mf.match_id IS NOT NULL THEN 'YES' ELSE 'NO' END as in_final_table
    FROM t_matches_live ml
    INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
    WHERE mb.tournament_id = ?
      AND ml.team1_id IS NOT NULL
      AND ml.team2_id IS NOT NULL
      AND ml.match_status = 'cancelled'
    ORDER BY ml.match_number
  `, [tournamentId]);
  console.log('Cancelled matches:', cancelledResult.rows.length);
  if (cancelledResult.rows.length > 0) {
    cancelledResult.rows.forEach(row => {
      console.log(`  Match ${row.match_id} (No.${row.match_number}): status=${row.match_status}, in_final=${row.in_final_table}`);
    });
  }

  process.exit(0);
})();
