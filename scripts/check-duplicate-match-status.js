const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

// Tursoクライアントの作成
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkDuplicateMatchStatus() {
  try {
    console.log('=== 複製大会の試合状態調査 ===\n');

    // 最近作成された大会を確認（複製元と複製先）
    const recentTournaments = await client.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        created_at
      FROM t_tournaments
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('最近の大会一覧:');
    recentTournaments.rows.forEach(row => {
      console.log(`ID:${row.tournament_id} - ${row.tournament_name} (${row.status}) - ${row.created_at}`);
    });

    // 複製元と複製先の大会IDを入力（最新の2つを使用）
    const sourceTournamentId = recentTournaments.rows[1]?.tournament_id; // 2番目（複製元）
    const targetTournamentId = recentTournaments.rows[0]?.tournament_id; // 1番目（複製先）

    if (!sourceTournamentId || !targetTournamentId) {
      console.log('大会が不足しています。手動で大会IDを指定してください。');
      return;
    }

    console.log(`\n比較対象: 複製元=${sourceTournamentId}, 複製先=${targetTournamentId}\n`);

    // 各大会のAブロック試合状態を比較
    for (const [label, tournamentId] of [
      ['複製元', sourceTournamentId], 
      ['複製先', targetTournamentId]
    ]) {
      console.log(`=== ${label} 大会ID:${tournamentId} ===`);

      // Aブロックの試合状態を確認
      const matches = await client.execute(`
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_team_id,
          ms.match_status,
          ms.current_period,
          CASE WHEN mf.match_id IS NOT NULL THEN 'confirmed' ELSE 'not_confirmed' END as confirmed_status,
          mb.block_name
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE mb.tournament_id = ? AND mb.block_name = 'A'
        ORDER BY ml.match_number
      `, [tournamentId]);

      console.log(`Aブロック試合数: ${matches.rows.length}`);
      matches.rows.forEach(row => {
        console.log(`  ${row.match_code}: ${row.team1_display_name} vs ${row.team2_display_name}`);
        console.log(`    Status: ${row.match_status || 'NULL'}, Confirmed: ${row.confirmed_status}`);
        console.log(`    Scores: ${row.team1_scores} - ${row.team2_scores}, Winner: ${row.winner_team_id || 'NULL'}`);
      });
      console.log('');
    }

    console.log('=== t_match_status テーブル比較 ===');
    for (const [label, tournamentId] of [
      ['複製元', sourceTournamentId], 
      ['複製先', targetTournamentId]
    ]) {
      const statusRecords = await client.execute(`
        SELECT 
          ms.*,
          mb.block_name,
          ml.match_code
        FROM t_match_status ms
        JOIN t_matches_live ml ON ms.match_id = ml.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.block_name = 'A'
        ORDER BY ml.match_number
      `, [tournamentId]);

      console.log(`${label} - t_match_status レコード数: ${statusRecords.rows.length}`);
      statusRecords.rows.forEach(row => {
        console.log(`  ${row.match_code}: status=${row.match_status}, period=${row.current_period}, updated_by=${row.updated_by}`);
      });
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

checkDuplicateMatchStatus();