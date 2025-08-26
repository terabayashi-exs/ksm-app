#!/usr/bin/env node

/**
 * 開発用データベースから実際のスキーマをエクスポートするスクリプト
 */

import { createClient } from '@libsql/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// データベース接続
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function exportSchema() {
  try {
    console.log('📥 開発用データベースからスキーマを取得中...');
    console.log('🔗 接続先:', process.env.DATABASE_URL);
    
    // すべてのテーブル情報を取得
    const tables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log(`📊 発見されたテーブル: ${tables.rows.length}個`);
    
    let schemaSQL = '';
    schemaSQL += '-- PK選手権大会システム DDL\n';
    schemaSQL += '-- Generated from ksm-dev database\n';
    schemaSQL += '-- Date: ' + new Date().toISOString().split('T')[0] + '\n\n';
    
    // 各テーブルのCREATE文を取得
    for (const table of tables.rows) {
      const tableName = table.name;
      console.log(`🔍 ${tableName} のスキーマを取得中...`);
      
      const createSQL = await db.execute(`
        SELECT sql FROM sqlite_master 
        WHERE type='table' AND name = ?
      `, [tableName]);
      
      if (createSQL.rows.length > 0) {
        schemaSQL += `-- ${tableName}\n`;
        schemaSQL += createSQL.rows[0].sql + ';\n\n';
      }
    }
    
    // インデックス情報を取得
    console.log('🔍 インデックス情報を取得中...');
    const indexes = await db.execute(`
      SELECT sql FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
      ORDER BY name
    `);
    
    if (indexes.rows.length > 0) {
      schemaSQL += '-- Indexes\n';
      for (const index of indexes.rows) {
        schemaSQL += index.sql + ';\n';
      }
    }
    
    // ファイルに保存
    const outputPath = join(process.cwd(), 'docs', 'database', 'schema-updated.sql');
    writeFileSync(outputPath, schemaSQL, 'utf-8');
    
    console.log('');
    console.log('✅ スキーマエクスポート完了！');
    console.log('📄 出力ファイル:', outputPath);
    console.log(`📊 統計:`);
    console.log(`  - テーブル数: ${tables.rows.length}個`);
    console.log(`  - インデックス数: ${indexes.rows.length}個`);
    
    // テーブル一覧表示
    console.log('');
    console.log('📋 エクスポートされたテーブル:');
    tables.rows.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    return {
      success: true,
      tablesCount: tables.rows.length,
      indexesCount: indexes.rows.length,
      outputPath
    };
    
  } catch (error) {
    console.error('❌ スキーマエクスポート失敗:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  exportSchema()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 スキーマエクスポート成功！');
        process.exit(0);
      } else {
        console.error('\n💀 スキーマエクスポート失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { exportSchema };