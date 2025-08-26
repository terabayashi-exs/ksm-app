#!/usr/bin/env node

/**
 * 本番用データベース（ksm-prod）にテーブル構造を構築するスクリプト
 * 
 * 使用方法:
 * 1. .env.localでDATABASE_URLとDATABASE_AUTH_TOKENを本番用に切り替える
 * 2. node scripts/migrate-to-production.js を実行
 * 
 * 注意: データのコピーは行われません。テーブル構造のみ構築されます。
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

async function migrateToProduction() {
  try {
    console.log('🚀 本番用データベースへのマイグレーション開始...');
    console.log('📍 接続先:', process.env.DATABASE_URL);
    
    // 最新のスキーマファイルを読み込み
    const schemaPath = join(process.cwd(), 'docs', 'database', 'schema-updated.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    console.log('📄 スキーマファイル読み込み完了');
    
    // 複数行のコメントと単行コメントを除去
    const cleanedSchema = schema
      .replace(/\/\*[\s\S]*?\*\//g, '') // /* */ コメント除去
      .split('\n')
      .filter(line => !line.trim().startsWith('--')) // -- コメント行除去
      .join('\n');
    
    // SQLをセミコロンで分割して個別に実行
    const allStatements = cleanedSchema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0)
      .filter(stmt => {
        // CREATE、INSERT、ALTER文のみ抽出
        const upperStmt = stmt.toUpperCase();
        return upperStmt.startsWith('CREATE') || 
               upperStmt.startsWith('INSERT') || 
               upperStmt.startsWith('ALTER');
      });
    
    // CREATE TABLE文とINDEX文を分離して、CREATE TABLEを先に実行
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
    
    console.log(`📊 統計情報:`);
    console.log(`  - CREATE TABLE文: ${createStatements.length}個`);
    console.log(`  - INDEX文: ${indexStatements.length}個`);
    console.log(`  - その他の文: ${otherStatements.length}個`);
    console.log(`  - 総実行文数: ${statements.length}個`);
    console.log('');
    
    // 実行前に既存テーブルの確認
    try {
      const existingTables = await db.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      if (existingTables.rows.length > 0) {
        console.log('⚠️  既存テーブルが検出されました:');
        existingTables.rows.forEach(row => {
          console.log(`  - ${row.name}`);
        });
        console.log('');
        console.log('💡 IF NOT EXISTS句により、既存テーブルは上書きされません');
        console.log('');
      } else {
        console.log('✅ データベースは空です。新規にテーブルを作成します。');
        console.log('');
      }
    } catch (error) {
      console.log('📝 新規データベースの様です。テーブル作成を開始します。');
      console.log('');
    }
    
    // SQLステートメントを順次実行
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          const preview = statement.length > 50 
            ? `${statement.substring(0, 50)}...`
            : statement;
          
          console.log(`🔄 [${i + 1}/${statements.length}] ${preview}`);
          
          await db.execute(statement);
          successCount++;
          
        } catch (statementError) {
          // "table already exists" エラーは正常（IF NOT EXISTS使用時）
          if (statementError.message && statementError.message.includes('already exists')) {
            console.log(`⏭️  スキップ（既存）: ${statement.split(' ')[2] || 'unknown'}`);
            skipCount++;
          } else {
            console.error(`❌ エラー発生 [文番号 ${i + 1}]:`, statement);
            console.error('エラー詳細:', statementError);
            throw statementError;
          }
        }
      }
    }
    
    console.log('');
    console.log('🎉 マイグレーション完了！');
    console.log(`📈 実行結果:`);
    console.log(`  - 成功: ${successCount}個`);
    console.log(`  - スキップ: ${skipCount}個`);
    console.log(`  - 合計: ${successCount + skipCount}個`);
    
    // 最終確認：作成されたテーブル一覧
    console.log('');
    console.log('📋 作成されたテーブル一覧:');
    const finalTables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    const masterTables = [];
    const transactionTables = [];
    
    finalTables.rows.forEach(row => {
      if (row.name.startsWith('m_')) {
        masterTables.push(row.name);
      } else if (row.name.startsWith('t_')) {
        transactionTables.push(row.name);
      }
    });
    
    console.log('');
    console.log('🗂️  マスターテーブル:');
    masterTables.forEach(table => console.log(`  - ${table}`));
    
    console.log('');
    console.log('🗂️  トランザクションテーブル:');
    transactionTables.forEach(table => console.log(`  - ${table}`));
    
    console.log('');
    console.log('✅ 本番用データベースの準備が完了しました！');
    console.log('');
    console.log('📝 次の手順:');
    console.log('  1. 必要に応じて初期データを投入してください');
    console.log('  2. アプリケーションの環境変数を本番用に切り替えてください');
    
    return { 
      success: true, 
      message: 'Production database migration completed successfully',
      tablesCreated: finalTables.rows.length,
      statementsExecuted: successCount,
      statementsSkipped: skipCount
    };
    
  } catch (error) {
    console.error('');
    console.error('💥 マイグレーション失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. DATABASE_URLとDATABASE_AUTH_TOKENが正しく設定されているか確認');
    console.error('  2. 本番データベース（ksm-prod）への接続権限があるか確認');
    console.error('  3. docs/database/schema.sqlファイルが存在するか確認');
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToProduction()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 マイグレーション成功！');
        process.exit(0);
      } else {
        console.error('\n💀 マイグレーション失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { migrateToProduction };