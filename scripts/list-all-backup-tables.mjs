import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数読み込み
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function listAllBackupTables() {
  try {
    console.log('=== 全てのバックアップテーブル ===\n');

    // sqlite_masterから全てのバックアップテーブルを検索
    const result = await db.execute(`
      SELECT name, sql FROM sqlite_master 
      WHERE type = 'table' 
      AND (name LIKE '%backup%' OR name LIKE '%bak%' OR name LIKE '%old%')
      ORDER BY name
    `);
    
    console.log(`見つかったバックアップ関連テーブル: ${result.rows.length}件\n`);
    for (const row of result.rows) {
      console.log(`テーブル名: ${row.name}`);
      
      // t_tournamentsのバックアップかどうか確認
      if (row.name.includes('tournaments') || row.sql.includes('tournament_name')) {
        console.log('  → t_tournamentsのバックアップの可能性があります');
        
        // ID:9のデータが存在するか確認
        try {
          const dataCheck = await db.execute(`
            SELECT tournament_id, tournament_name FROM ${row.name} 
            WHERE tournament_id = 9 LIMIT 1
          `);
          if (dataCheck.rows.length > 0) {
            console.log(`  ✅ ID:9のデータが見つかりました: ${dataCheck.rows[0].tournament_name}`);
          }
        } catch (e) {
          // エラーを無視（カラムが存在しない可能性）
        }
      }
      console.log('');
    }

    // 特定の日付パターンでもう一度検索
    console.log('\n=== 日付パターンで検索 ===');
    const datePatternResult = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name LIKE '%202509%'
      ORDER BY name
    `);
    
    if (datePatternResult.rows.length > 0) {
      console.log('2025年9月のバックアップテーブル:');
      for (const row of datePatternResult.rows) {
        console.log(`- ${row.name}`);
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

listAllBackupTables();