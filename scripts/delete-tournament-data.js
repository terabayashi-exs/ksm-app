// scripts/delete-tournament-data.js
const { createClient } = require('@libsql/client');

// 環境変数を取得
const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  console.error('❌ 環境変数が設定されていません:');
  console.error('   DATABASE_URL:', !!databaseUrl);
  console.error('   DATABASE_AUTH_TOKEN:', !!authToken);
  process.exit(1);
}

const db = createClient({
  url: databaseUrl,
  authToken: authToken,
});

// コマンドライン引数から大会IDを取得
const tournamentId = parseInt(process.argv[2]);
if (!tournamentId || isNaN(tournamentId)) {
  console.error('❌ 使用方法: node scripts/delete-tournament-data.js <tournament_id>');
  console.error('   例: node scripts/delete-tournament-data.js 9');
  process.exit(1);
}

async function deleteTournamentData(tournamentId) {
  try {
    console.log(`🗑️  大会ID ${tournamentId} の関連データを削除します...\n`);

    // 1. 削除前の状態確認
    console.log('📊 削除前の状態確認:');
    
    // アーカイブ状態確認
    const tournamentResult = await db.execute(`
      SELECT tournament_name, is_archived, archive_ui_version
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (tournamentResult.rows.length === 0) {
      console.error(`❌ 大会ID ${tournamentId} が見つかりません`);
      process.exit(1);
    }
    
    const tournament = tournamentResult.rows[0];
    console.log(`   - 大会名: ${tournament.tournament_name}`);
    console.log(`   - アーカイブ済み: ${tournament.is_archived ? 'はい' : 'いいえ'}`);
    console.log(`   - UIバージョン: ${tournament.archive_ui_version || 'なし'}`);

    // アーカイブデータの存在確認
    const archiveResult = await db.execute(`
      SELECT archived_at, archived_by
      FROM t_archived_tournament_json
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (archiveResult.rows.length > 0) {
      console.log(`   - アーカイブデータ: あり (${archiveResult.rows[0].archived_at})`);
    } else {
      console.log(`   - アーカイブデータ: なし`);
      console.log('⚠️  警告: アーカイブデータが見つかりません！');
      console.log('   削除したデータは復元できません。続行しますか？');
    }

    // 削除対象データの件数確認
    const teamCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?
    `, [tournamentId]);
    
    const matchCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    
    const finalMatchCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_final mf
      JOIN t_matches_live ml ON mf.match_id = ml.match_id
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    
    const blockCountResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_match_blocks WHERE tournament_id = ?
    `, [tournamentId]);
    
    console.log('\n📋 削除対象データ:');
    console.log(`   - 参加チーム: ${teamCountResult.rows[0].count} 件`);
    console.log(`   - 試合: ${matchCountResult.rows[0].count} 件`);
    console.log(`   - 確定済み試合: ${finalMatchCountResult.rows[0].count} 件`);
    console.log(`   - ブロック: ${blockCountResult.rows[0].count} 件\n`);

    // ユーザーに確認
    console.log('⚠️  警告: この操作は取り消すことができません！');
    console.log('削除を実行しますか？ (yes/no): ');
    
    // 標準入力を待つ
    await new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        if (answer !== 'yes') {
          console.log('❌ 削除をキャンセルしました');
          process.exit(0);
        }
        resolve();
      });
    });

    // 2. データ削除の実行
    console.log('\n🗑️  削除処理を実行中...\n');

    // t_matches_final の削除
    console.log('🔄 確定済み試合データを削除中...');
    const deleteFinalResult = await db.execute(`
      DELETE FROM t_matches_final WHERE match_id IN (
        SELECT ml.match_id FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      )
    `, [tournamentId]);
    console.log(`✅ ${deleteFinalResult.rowsAffected} 件の確定済み試合データを削除`);

    // t_tournament_players の削除（もし存在すれば）
    console.log('🔄 参加選手データを削除中...');
    try {
      const deletePlayersResult = await db.execute(`
        DELETE FROM t_tournament_players WHERE tournament_id = ?
      `, [tournamentId]);
      console.log(`✅ ${deletePlayersResult.rowsAffected} 件の参加選手データを削除`);
    } catch (error) {
      console.log('ℹ️  参加選手データは存在しないか、既に削除済み');
    }

    // t_tournament_teams の削除
    console.log('🔄 参加チームデータを削除中...');
    const deleteTeamsResult = await db.execute(`
      DELETE FROM t_tournament_teams WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`✅ ${deleteTeamsResult.rowsAffected} 件の参加チームデータを削除`);

    // t_matches_live の削除
    console.log('🔄 試合データを削除中...');
    const deleteMatchesResult = await db.execute(`
      DELETE FROM t_matches_live WHERE match_block_id IN (
        SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
      )
    `, [tournamentId]);
    console.log(`✅ ${deleteMatchesResult.rowsAffected} 件の試合データを削除`);

    // t_match_blocks の削除
    console.log('🔄 ブロックデータを削除中...');
    const deleteBlocksResult = await db.execute(`
      DELETE FROM t_match_blocks WHERE tournament_id = ?
    `, [tournamentId]);
    console.log(`✅ ${deleteBlocksResult.rowsAffected} 件のブロックデータを削除`);

    console.log('\n🎉 削除が完了しました！\n');

    // 3. 削除後の状態確認
    console.log('📋 削除後の状態確認:');
    
    const afterTeamCount = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?
    `, [tournamentId]);
    
    const afterMatchCount = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    
    const afterBlockCount = await db.execute(`
      SELECT COUNT(*) as count FROM t_match_blocks WHERE tournament_id = ?
    `, [tournamentId]);
    
    console.log(`   - 残存チーム: ${afterTeamCount.rows[0].count} 件`);
    console.log(`   - 残存試合: ${afterMatchCount.rows[0].count} 件`);
    console.log(`   - 残存ブロック: ${afterBlockCount.rows[0].count} 件`);

    // t_tournaments テーブルは削除せず、アーカイブフラグを維持
    const finalTournamentResult = await db.execute(`
      SELECT tournament_name, is_archived, archive_ui_version
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);
    
    if (finalTournamentResult.rows.length > 0) {
      console.log(`   - 大会基本情報: 保持されています`);
      console.log(`   - アーカイブフラグ: ${finalTournamentResult.rows[0].is_archived ? 'ON' : 'OFF'}`);
    }

    console.log('\n✅ すべての処理が正常に完了しました');
    console.log('💡 復元が必要な場合は以下のコマンドを実行してください:');
    console.log(`   node scripts/restore-from-archive.js ${tournamentId}`);

  } catch (error) {
    console.error('❌ 削除エラー:', error);
    console.error('エラー詳細:', error.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// メイン処理を実行
deleteTournamentData(tournamentId);