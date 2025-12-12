import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

console.log('=== t_matches_live のスコアデータ確認 ===\n');

const liveMatches = await db.execute(`
  SELECT match_id, match_code, team1_scores, team2_scores, period_count
  FROM t_matches_live
  WHERE team1_scores IS NOT NULL OR team2_scores IS NOT NULL
  LIMIT 20
`);

console.log('サンプル数:', liveMatches.rows.length);
liveMatches.rows.forEach(row => {
  console.log(`Match ${row.match_id} (${row.match_code}):`);
  console.log(`  team1_scores: "${row.team1_scores}"`);
  console.log(`  team2_scores: "${row.team2_scores}"`);
  console.log(`  period_count: ${row.period_count}`);
  console.log('');
});

console.log('\n=== t_matches_final のスコアデータ確認 ===\n');

const finalMatches = await db.execute(`
  SELECT match_id, match_code, team1_scores, team2_scores, period_count
  FROM t_matches_final
  WHERE team1_scores IS NOT NULL OR team2_scores IS NOT NULL
  LIMIT 20
`);

console.log('サンプル数:', finalMatches.rows.length);
finalMatches.rows.forEach(row => {
  console.log(`Match ${row.match_id} (${row.match_code}):`);
  console.log(`  team1_scores: "${row.team1_scores}"`);
  console.log(`  team2_scores: "${row.team2_scores}"`);
  console.log(`  period_count: ${row.period_count}`);
  console.log('');
});

// ユニークなパターンを集計
console.log('\n=== スコア形式の分類 ===\n');

const allMatches = await db.execute(`
  SELECT team1_scores, team2_scores FROM t_matches_live
  UNION ALL
  SELECT team1_scores, team2_scores FROM t_matches_final
`);

const patterns = new Map();
allMatches.rows.forEach(row => {
  const t1 = row.team1_scores;
  const t2 = row.team2_scores;

  let pattern = 'NULL';

  if (t1 !== null || t2 !== null) {
    const sample = String(t1 || t2);
    if (sample.startsWith('[')) {
      pattern = 'JSON配列';
    } else if (sample.includes(',')) {
      pattern = 'カンマ区切り';
    } else if (!isNaN(sample)) {
      pattern = '数値のみ';
    } else {
      pattern = 'その他';
    }
  }

  patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
});

console.log('形式別の件数:');
patterns.forEach((count, pattern) => {
  console.log(`  ${pattern}: ${count}件`);
});

db.close();
