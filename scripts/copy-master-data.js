#!/usr/bin/env node

/**
 * 開発用データベースから本番用データベースへマスターデータをコピーするスクリプト
 * 
 * 使用方法:
 * 1. 本番用のDATABASE_URL、DATABASE_AUTH_TOKENを環境変数で指定
 * 2. node scripts/copy-master-data.js を実行
 * 
 * 注意: 
 * - マスターデータ（m_*）のみコピーします
 * - 既存データは削除されます（管理者データ除く）
 * - トランザクションデータ（t_*）はコピーしません
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// 開発用データベース接続（コピー元）
const devDb = createClient({
  url: process.env.DEV_DATABASE_URL || "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: process.env.DEV_DATABASE_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA",
});

// 本番用データベース接続（コピー先）
const prodDb = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// コピー対象のマスターテーブル
const masterTables = [
  'm_venues',
  'm_tournament_formats', 
  'm_match_templates',
  'm_teams',
  'm_players',
  // 'm_administrators' は除外（本番用管理者を保護）
];

async function copyMasterData() {
  try {
    console.log('🔄 マスターデータコピー開始...');
    console.log('📤 コピー元（開発用）:', process.env.DEV_DATABASE_URL || 'ksm-dev');
    console.log('📥 コピー先（本番用）:', process.env.DATABASE_URL);
    console.log('');
    
    const copyResults = [];
    
    for (const tableName of masterTables) {
      try {
        console.log(`🔍 ${tableName} を処理中...`);
        
        // 開発用DBからデータを取得
        const sourceData = await devDb.execute(`SELECT * FROM ${tableName}`);
        
        if (sourceData.rows.length === 0) {
          console.log(`⏭️  ${tableName}: データなし（スキップ）`);
          copyResults.push({ table: tableName, status: 'skipped', count: 0 });
          continue;
        }
        
        // 本番用DBの既存データを削除
        await prodDb.execute(`DELETE FROM ${tableName}`);
        console.log(`🗑️  ${tableName}: 既存データを削除`);
        
        // カラム名を取得
        const columns = Object.keys(sourceData.rows[0]);
        const columnNames = columns.join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        
        // データを挿入
        const insertSql = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
        
        let insertedCount = 0;
        for (const row of sourceData.rows) {
          const values = columns.map(col => row[col]);
          await prodDb.execute(insertSql, values);
          insertedCount++;
        }
        
        console.log(`✅ ${tableName}: ${insertedCount}件のデータをコピー完了`);
        copyResults.push({ table: tableName, status: 'success', count: insertedCount });
        
      } catch (tableError) {
        console.error(`❌ ${tableName}: エラー発生`);
        console.error('エラー詳細:', tableError);
        copyResults.push({ table: tableName, status: 'error', error: tableError.message });
      }
    }
    
    console.log('');
    console.log('📊 コピー結果サマリー:');
    console.log('');
    
    const successTables = copyResults.filter(r => r.status === 'success');
    const errorTables = copyResults.filter(r => r.status === 'error');
    const skippedTables = copyResults.filter(r => r.status === 'skipped');
    
    if (successTables.length > 0) {
      console.log('✅ 成功:');
      successTables.forEach(result => {
        console.log(`  - ${result.table}: ${result.count}件`);
      });
    }
    
    if (skippedTables.length > 0) {
      console.log('⏭️  スキップ:');
      skippedTables.forEach(result => {
        console.log(`  - ${result.table}: データなし`);
      });
    }
    
    if (errorTables.length > 0) {
      console.log('❌ エラー:');
      errorTables.forEach(result => {
        console.log(`  - ${result.table}: ${result.error}`);
      });
    }
    
    const totalCopied = successTables.reduce((sum, r) => sum + r.count, 0);
    
    console.log('');
    console.log(`🎉 マスターデータコピー完了！`);
    console.log(`📈 統計:`);
    console.log(`  - 成功テーブル: ${successTables.length}個`);
    console.log(`  - コピー総件数: ${totalCopied}件`);
    console.log(`  - エラーテーブル: ${errorTables.length}個`);
    
    if (errorTables.length === 0) {
      console.log('');
      console.log('✅ すべてのマスターデータが正常にコピーされました！');
      console.log('');
      console.log('📝 次の手順:');
      console.log('  1. 本番用管理者アカウントが設定されているか確認');
      console.log('  2. アプリケーションで本番データベースに接続して動作確認');
      console.log('  3. 必要に応じてトランザクションデータの初期化');
    }
    
    return {
      success: errorTables.length === 0,
      totalCopied,
      successCount: successTables.length,
      errorCount: errorTables.length,
      details: copyResults
    };
    
  } catch (error) {
    console.error('');
    console.error('💥 マスターデータコピー失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. 開発用・本番用両方のデータベース認証情報が正しいか確認');
    console.error('  2. テーブル構造が開発用・本番用で一致しているか確認');
    console.error('  3. 本番用データベースが適切に初期化されているか確認');
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  copyMasterData()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 マスターデータコピー成功！');
        process.exit(0);
      } else {
        console.error('\n💀 マスターデータコピー失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { copyMasterData };