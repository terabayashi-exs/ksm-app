#!/usr/bin/env node

/**
 * 本番用データベースを完全にリセットして、最新スキーマで再構築するスクリプト
 * 
 * 警告: 全データが削除されます
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// データベース接続設定
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function resetProduction() {
  try {
    console.log('⚠️  本番用データベースの完全リセットを開始...');
    console.log('📍 接続先:', process.env.DATABASE_URL);
    console.log('');
    console.log('🚨 警告: 全データが削除されます！');
    
    // 既存テーブル一覧を取得
    const existingTables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    if (existingTables.rows.length > 0) {
      console.log('');
      console.log('🗑️  削除対象テーブル:');
      existingTables.rows.forEach(row => {
        console.log(`  - ${row.name}`);
      });
      
      // テーブルを削除
      console.log('');
      console.log('🔥 テーブル削除中...');
      for (const table of existingTables.rows) {
        console.log(`🗑️  ${table.name} を削除`);
        await db.execute(`DROP TABLE IF EXISTS "${table.name}"`);
      }
    } else {
      console.log('✅ データベースは既に空です');
    }
    
    // インデックスも削除
    const existingIndexes = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    if (existingIndexes.rows.length > 0) {
      console.log('');
      console.log('🔧 インデックス削除中...');
      for (const index of existingIndexes.rows) {
        console.log(`🗑️  ${index.name} を削除`);
        await db.execute(`DROP INDEX IF EXISTS "${index.name}"`);
      }
    }
    
    console.log('');
    console.log('🏗️  最新スキーマでテーブル再作成...');
    
    // 最新のスキーマファイルを読み込み
    const schemaPath = join(process.cwd(), 'docs', 'database', 'schema-updated.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // スキーマ解析
    const cleanedSchema = schema
      .replace(/\/\*[\s\S]*?\*\//g, '') // /* */ コメント除去
      .split('\n')
      .filter(line => !line.trim().startsWith('--')) // -- コメント行除去
      .join('\n');
    
    const allStatements = cleanedSchema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0)
      .filter(stmt => {
        const upperStmt = stmt.toUpperCase();
        return upperStmt.startsWith('CREATE') || 
               upperStmt.startsWith('INSERT') || 
               upperStmt.startsWith('ALTER');
      });
    
    // CREATE TABLE文とINDEX文を分離
    const createStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE TABLE'));
    const indexStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE INDEX') || 
      stmt.toUpperCase().startsWith('CREATE UNIQUE INDEX'));
    const otherStatements = allStatements.filter(stmt => 
      !stmt.toUpperCase().startsWith('CREATE TABLE') && 
      !stmt.toUpperCase().startsWith('CREATE INDEX') && 
      !stmt.toUpperCase().startsWith('CREATE UNIQUE INDEX')
    );
    
    const statements = [...createStatements, ...otherStatements, ...indexStatements];
    
    console.log(`📊 再作成対象:`);
    console.log(`  - CREATE TABLE文: ${createStatements.length}個`);
    console.log(`  - INDEX文: ${indexStatements.length}個`);
    console.log(`  - その他の文: ${otherStatements.length}個`);
    console.log(`  - 総実行文数: ${statements.length}個`);
    console.log('');
    
    // SQLステートメントを順次実行
    let successCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          const preview = statement.length > 60 
            ? `${statement.substring(0, 60)}...`
            : statement;
          
          console.log(`🔄 [${i + 1}/${statements.length}] ${preview}`);
          
          await db.execute(statement);
          successCount++;
          
        } catch (statementError) {
          console.error(`❌ エラー発生 [文番号 ${i + 1}]:`, statement);
          console.error('エラー詳細:', statementError);
          throw statementError;
        }
      }
    }
    
    console.log('');
    console.log('🎉 データベースリセット・再構築完了！');
    console.log(`📈 実行結果:`);
    console.log(`  - 削除テーブル: ${existingTables.rows.length}個`);
    console.log(`  - 削除インデックス: ${existingIndexes.rows.length}個`);
    console.log(`  - 作成成功: ${successCount}個`);
    
    // 最終確認：作成されたテーブル一覧
    console.log('');
    console.log('📋 再作成されたテーブル一覧:');
    const finalTables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    const masterTables = [];
    const transactionTables = [];
    const otherTables = [];
    
    finalTables.rows.forEach(row => {
      if (row.name.startsWith('m_')) {
        masterTables.push(row.name);
      } else if (row.name.startsWith('t_')) {
        transactionTables.push(row.name);
      } else {
        otherTables.push(row.name);
      }
    });
    
    console.log('');
    console.log('🗂️  マスターテーブル:');
    masterTables.forEach(table => console.log(`  - ${table}`));
    
    console.log('');
    console.log('🗂️  トランザクションテーブル:');
    transactionTables.forEach(table => console.log(`  - ${table}`));
    
    if (otherTables.length > 0) {
      console.log('');
      console.log('🗂️  その他のテーブル:');
      otherTables.forEach(table => console.log(`  - ${table}`));
    }
    
    console.log('');
    console.log('✅ 本番用データベースが最新スキーマで完全に再構築されました！');
    console.log('');
    console.log('📝 次の手順:');
    console.log('  1. マスターデータのコピーを実行してください');
    console.log('  2. 管理者アカウントを設定してください');
    
    return { 
      success: true, 
      tablesDeleted: existingTables.rows.length,
      indexesDeleted: existingIndexes.rows.length,
      tablesCreated: finalTables.rows.length,
      statementsExecuted: successCount
    };
    
  } catch (error) {
    console.error('');
    console.error('💥 データベースリセット失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. DATABASE_URLとDATABASE_AUTH_TOKENが正しく設定されているか確認');
    console.error('  2. 本番データベース（ksm-prod）への書き込み権限があるか確認');
    console.error('  3. docs/database/schema-updated.sqlファイルが存在するか確認');
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  resetProduction()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 データベースリセット成功！');
        process.exit(0);
      } else {
        console.error('\n💀 データベースリセット失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { resetProduction };