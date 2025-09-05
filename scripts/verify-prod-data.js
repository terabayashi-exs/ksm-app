const { createClient } = require('@libsql/client');

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function verifyData() {
  const client = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('=== 本番環境データベース検証 ===\n');

    // 1. 主要テーブルの行数確認
    console.log('【テーブル行数】');
    const tables = [
      't_tournaments',
      't_tournament_teams',
      't_matches_live',
      't_matches_final',
      'm_teams',
      'm_players'
    ];

    for (const table of tables) {
      const result = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`${table}: ${result.rows[0].count}行`);
    }

    // 2. 最新の試合結果確認
    console.log('\n【最新の確定済み試合（10件）】');
    const finalMatches = await client.execute(`
      SELECT 
        mf.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        mf.winner_team_id,
        mf.is_draw,
        mf.updated_at
      FROM t_matches_final mf
      JOIN t_matches_live ml ON mf.match_id = ml.match_id
      ORDER BY mf.match_id DESC
      LIMIT 10
    `);

    for (const match of finalMatches.rows) {
      const result = match.is_draw === 1 ? '(引き分け)' : match.winner_team_id ? '(勝者あり)' : '';
      console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} ${result}`);
    }

    // 3. 大会ごとの試合数確認
    console.log('\n【大会ごとの試合統計】');
    const tournamentStats = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        COUNT(DISTINCT ml.match_id) as total_matches,
        COUNT(DISTINCT mf.match_id) as confirmed_matches
      FROM t_tournaments t
      LEFT JOIN t_match_blocks mb ON t.tournament_id = mb.tournament_id
      LEFT JOIN t_matches_live ml ON mb.match_block_id = ml.match_block_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      GROUP BY t.tournament_id, t.tournament_name
      ORDER BY t.tournament_id
    `);

    for (const stat of tournamentStats.rows) {
      console.log(`${stat.tournament_name}: ${stat.confirmed_matches}/${stat.total_matches}試合確定`);
    }

    // 4. 最新の順位表確認
    console.log('\n【最新の順位表更新】');
    const rankings = await client.execute(`
      SELECT 
        mb.tournament_id,
        mb.block_name,
        mb.updated_at,
        LENGTH(mb.team_rankings) as rankings_size
      FROM t_match_blocks mb
      WHERE mb.team_rankings IS NOT NULL
      ORDER BY mb.updated_at DESC
      LIMIT 5
    `);

    for (const rank of rankings.rows) {
      console.log(`Tournament ${rank.tournament_id} - ${rank.block_name}: ${rank.updated_at} (${rank.rankings_size} bytes)`);
    }

    console.log('\n✅ 検証完了！');

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
verifyData().catch(console.error);