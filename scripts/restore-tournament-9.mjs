import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function restoreTournament9() {
  try {
    console.log('=== 大会ID:9の復元処理 ===\n');

    // 1. t_backup_metadataから大会ID:9のデータを確認
    console.log('1. バックアップデータの確認:');
    const backupData = await db.execute(`
      SELECT * FROM t_backup_metadata 
      WHERE tournament_id = 9
    `);
    
    if (backupData.rows.length === 0) {
      console.log('バックアップデータが見つかりません。');
      return;
    }

    console.log('バックアップデータが見つかりました:');
    console.log(JSON.stringify(backupData.rows[0], null, 2));

    // 2. 現在のt_tournamentsテーブルを確認
    console.log('\n2. 現在のt_tournamentsテーブルの確認:');
    const currentData = await db.execute(`
      SELECT * FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (currentData.rows.length > 0) {
      console.log('データが既に存在します。復元をスキップします。');
      return;
    }
    
    console.log('データが存在しません。復元を実行します。');

    // 3. t_tournamentsテーブルの構造を確認
    console.log('\n3. t_tournamentsテーブルの構造確認:');
    const tableInfo = await db.execute(`
      PRAGMA table_info(t_tournaments)
    `);
    
    const columnNames = tableInfo.rows.map(row => row.name);
    console.log('カラム一覧:', columnNames.join(', '));

    // 4. t_backup_metadataテーブルの構造を確認
    console.log('\n4. t_backup_metadataテーブルの構造確認:');
    const backupTableInfo = await db.execute(`
      PRAGMA table_info(t_backup_metadata)
    `);
    
    const backupColumnNames = backupTableInfo.rows.map(row => row.name);
    console.log('カラム一覧:', backupColumnNames.join(', '));

    // 5. 共通カラムを特定
    const commonColumns = columnNames.filter(col => backupColumnNames.includes(col));
    console.log('\n5. 共通カラム:', commonColumns.join(', '));

    // 6. データを復元
    console.log('\n6. データ復元を実行:');
    
    const insertColumns = commonColumns.join(', ');
    const insertQuery = `
      INSERT INTO t_tournaments (${insertColumns})
      SELECT ${insertColumns}
      FROM t_backup_metadata
      WHERE tournament_id = 9
    `;
    
    console.log('実行するクエリ:');
    console.log(insertQuery);
    
    await db.execute(insertQuery);
    
    console.log('\n✅ 復元が完了しました！');
    
    // 7. 復元結果を確認
    console.log('\n7. 復元結果の確認:');
    const restoredData = await db.execute(`
      SELECT * FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (restoredData.rows.length > 0) {
      console.log('復元されたデータ:');
      console.log(JSON.stringify(restoredData.rows[0], null, 2));
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

restoreTournament9();