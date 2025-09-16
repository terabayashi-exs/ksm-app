import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkTournamentData() {
  try {
    console.log('=== 大会ID:9のデータ確認 ===\n');

    // 1. バックアップテーブルからID:9のデータを確認
    console.log('1. バックアップテーブル (backup_20250912_182026_t_tournaments) の確認:');
    const backupResult = await db.execute(
      'SELECT * FROM backup_20250912_182026_t_tournaments WHERE tournament_id = 9'
    );
    
    if (backupResult.rows.length > 0) {
      console.log('バックアップデータが見つかりました:');
      console.log(JSON.stringify(backupResult.rows[0], null, 2));
    } else {
      console.log('バックアップデータが見つかりません。');
    }

    console.log('\n2. 現在のt_tournamentsテーブルの確認:');
    const currentResult = await db.execute(
      'SELECT * FROM t_tournaments WHERE tournament_id = 9'
    );
    
    if (currentResult.rows.length > 0) {
      console.log('現在のデータが見つかりました:');
      console.log(JSON.stringify(currentResult.rows[0], null, 2));
    } else {
      console.log('現在のデータは存在しません。復元が必要です。');
    }

    // 3. 関連データの確認
    console.log('\n3. 関連データの確認:');
    const relatedData = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM t_tournament_teams WHERE tournament_id = 9) as teams_count,
        (SELECT COUNT(*) FROM t_match_blocks WHERE tournament_id = 9) as blocks_count,
        (SELECT COUNT(*) FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = 9)) as matches_count
    `);
    console.log('関連データ数:', relatedData.rows[0]);

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

checkTournamentData();