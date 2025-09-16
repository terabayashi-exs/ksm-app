import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function searchTournamentsBackup() {
  try {
    console.log('=== t_tournamentsのバックアップテーブル検索 ===\n');

    // 1. 全テーブルから t_tournaments パターンを検索
    const allTables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name LIKE '%tournament%'
      ORDER BY name
    `);
    
    console.log('tournament関連のテーブル:');
    for (const row of allTables.rows) {
      console.log(`- ${row.name}`);
      
      // t_tournamentsのバックアップの可能性があるテーブルをチェック
      if (row.name !== 't_tournaments' && !row.name.includes('teams') && !row.name.includes('players') && !row.name.includes('notifications')) {
        try {
          // tournament_idとformat_idが存在するか確認
          const checkColumns = await db.execute(`
            SELECT COUNT(*) as count 
            FROM pragma_table_info('${row.name}') 
            WHERE name IN ('tournament_id', 'format_id')
          `);
          
          if (checkColumns.rows[0].count === 2) {
            console.log(`  → ${row.name}はt_tournamentsのバックアップの可能性があります`);
            
            // ID:9のデータを確認
            const dataCheck = await db.execute(`
              SELECT tournament_id, tournament_name, format_id 
              FROM ${row.name} 
              WHERE tournament_id = 9 
              LIMIT 1
            `);
            
            if (dataCheck.rows.length > 0) {
              console.log(`  ✅ ID:9のデータが見つかりました！`);
              console.log(`     名前: ${dataCheck.rows[0].tournament_name}`);
              console.log(`     format_id: ${dataCheck.rows[0].format_id}`);
            }
          }
        } catch (e) {
          // エラーは無視
        }
      }
    }

    // 2. backup_20250912_182026 パターンを持つテーブルを検索
    console.log('\n\n=== バックアップ日時パターンで検索 ===');
    const backupDatePattern = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name LIKE '%20250912_182026%'
      AND NOT name LIKE '%teams%'
      AND NOT name LIKE '%players%'
      AND NOT name LIKE '%match%'
      AND NOT name LIKE '%notification%'
      ORDER BY name
    `);
    
    if (backupDatePattern.rows.length > 0) {
      console.log('該当するテーブル:');
      for (const row of backupDatePattern.rows) {
        console.log(`- ${row.name}`);
      }
    } else {
      console.log('該当するテーブルが見つかりませんでした。');
    }

    // 3. 単純に t_tournaments_backup というテーブルがあるか確認
    console.log('\n\n=== 単純な名前パターンで検索 ===');
    const simplePatterns = [
      't_tournaments_backup',
      't_tournaments_bak',
      't_tournaments_old',
      'tournaments_backup',
      'backup_t_tournaments'
    ];
    
    for (const pattern of simplePatterns) {
      const exists = await db.execute(`
        SELECT COUNT(*) as count 
        FROM sqlite_master 
        WHERE type = 'table' 
        AND name = '${pattern}'
      `);
      
      if (exists.rows[0].count > 0) {
        console.log(`✅ ${pattern} テーブルが存在します！`);
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

searchTournamentsBackup();