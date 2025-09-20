const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

// Tursoクライアントの作成
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function updateMatchTimes(tournamentId) {
  try {
    console.log(`\n=== 大会ID:${tournamentId}の試合時間を更新中 ===\n`);

    // 大会情報を取得
    const tournament = await client.execute(`
      SELECT tournament_name, format_id
      FROM t_tournaments
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournament.rows.length === 0) {
      console.log(`大会ID:${tournamentId}が見つかりません。`);
      return false;
    }

    const formatId = tournament.rows[0].format_id;
    console.log(`大会名: ${tournament.rows[0].tournament_name}`);
    console.log(`フォーマットID: ${formatId}`);

    // まず、t_matches_liveテーブルを更新
    console.log('\n1. t_matches_liveテーブルの更新...');
    
    const liveUpdateResult = await client.execute(`
      UPDATE t_matches_live
      SET start_time = (
        SELECT mt.suggested_start_time
        FROM m_match_templates mt
        WHERE mt.format_id = ?
        AND mt.match_code = t_matches_live.match_code
      )
      WHERE EXISTS (
        SELECT 1 
        FROM t_match_blocks mb
        WHERE mb.match_block_id = t_matches_live.match_block_id
        AND mb.tournament_id = ?
      )
      AND EXISTS (
        SELECT 1
        FROM m_match_templates mt
        WHERE mt.format_id = ?
        AND mt.match_code = t_matches_live.match_code
        AND mt.suggested_start_time IS NOT NULL
      )
    `, [formatId, tournamentId, formatId]);

    console.log(`t_matches_live: ${liveUpdateResult.rowsAffected}件更新`);

    // 次に、t_matches_finalテーブルを更新
    console.log('\n2. t_matches_finalテーブルの更新...');
    
    const finalUpdateResult = await client.execute(`
      UPDATE t_matches_final
      SET start_time = (
        SELECT mt.suggested_start_time
        FROM m_match_templates mt
        WHERE mt.format_id = ?
        AND mt.match_code = t_matches_final.match_code
      )
      WHERE EXISTS (
        SELECT 1 
        FROM t_match_blocks mb
        WHERE mb.match_block_id = t_matches_final.match_block_id
        AND mb.tournament_id = ?
      )
      AND EXISTS (
        SELECT 1
        FROM m_match_templates mt
        WHERE mt.format_id = ?
        AND mt.match_code = t_matches_final.match_code
        AND mt.suggested_start_time IS NOT NULL
      )
    `, [formatId, tournamentId, formatId]);

    console.log(`t_matches_final: ${finalUpdateResult.rowsAffected}件更新`);

    // 更新後の結果を確認
    console.log('\n3. 更新結果の確認...');
    
    const checkResult = await client.execute(`
      SELECT 
        ml.match_code,
        ml.start_time,
        mb.phase
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
      ORDER BY ml.match_number
      LIMIT 10
    `, [tournamentId]);

    checkResult.rows.forEach(row => {
      console.log(`  ${row.match_code}: ${row.start_time} (${row.phase})`);
    });

    console.log(`\n大会ID:${tournamentId}の更新が完了しました。`);
    return true;

  } catch (error) {
    console.error(`大会ID:${tournamentId}の更新中にエラーが発生しました:`, error);
    return false;
  }
}

async function main() {
  const tournamentIds = [43, 24, 25, 28, 29];
  let successCount = 0;

  console.log('=== 試合時間一括更新スクリプト ===');
  console.log(`対象大会: ${tournamentIds.join(', ')}`);

  for (const tournamentId of tournamentIds) {
    const success = await updateMatchTimes(tournamentId);
    if (success) {
      successCount++;
    }
    console.log('\n' + '='.repeat(50));
  }

  console.log(`\n更新完了: ${successCount}/${tournamentIds.length}件の大会が正常に更新されました。`);
  client.close();
}

main();