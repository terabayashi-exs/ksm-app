#!/usr/bin/env node

/**
 * m_match_templatesテーブルにcourt_numberとsuggested_start_timeカラムを追加するスクリプト
 * 
 * 追加カラム:
 * - court_number INTEGER (NULLを許可、手動コート指定用)
 * - suggested_start_time TEXT (NULLを許可、手動時間指定用)
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// データベース接続設定
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function addCourtTimeColumns() {
  try {
    console.log('🏗️  m_match_templatesテーブル拡張開始...');
    console.log('📍 接続先:', process.env.DATABASE_URL);
    console.log('');

    // 現在のテーブル構造を確認
    console.log('🔍 現在のテーブル構造を確認中...');
    const tableInfo = await db.execute(`PRAGMA table_info(m_match_templates)`);
    
    console.log('📋 現在のカラム一覧:');
    const existingColumns = [];
    tableInfo.rows.forEach(row => {
      console.log(`  - ${row.name} (${row.type}${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ''})`);
      existingColumns.push(row.name);
    });

    // 既存カラムのチェック
    const hasCourtNumber = existingColumns.includes('court_number');
    const hasStartTime = existingColumns.includes('suggested_start_time');

    console.log('');
    console.log('🔍 追加対象カラムの確認:');
    console.log(`  - court_number: ${hasCourtNumber ? '✅ 既に存在' : '➕ 追加が必要'}`);
    console.log(`  - suggested_start_time: ${hasStartTime ? '✅ 既に存在' : '➕ 追加が必要'}`);

    let addedColumns = 0;

    // court_numberカラムを追加
    if (!hasCourtNumber) {
      console.log('');
      console.log('➕ court_numberカラムを追加中...');
      await db.execute(`
        ALTER TABLE m_match_templates 
        ADD COLUMN court_number INTEGER
      `);
      console.log('✅ court_numberカラムを追加しました');
      addedColumns++;
    }

    // suggested_start_timeカラムを追加
    if (!hasStartTime) {
      console.log('');
      console.log('➕ suggested_start_timeカラムを追加中...');
      await db.execute(`
        ALTER TABLE m_match_templates 
        ADD COLUMN suggested_start_time TEXT
      `);
      console.log('✅ suggested_start_timeカラムを追加しました');
      addedColumns++;
    }

    if (addedColumns === 0) {
      console.log('');
      console.log('ℹ️  追加が必要なカラムはありません（既に存在します）');
    }

    // 更新後のテーブル構造を確認
    console.log('');
    console.log('🔍 更新後のテーブル構造:');
    const updatedTableInfo = await db.execute(`PRAGMA table_info(m_match_templates)`);
    
    updatedTableInfo.rows.forEach(row => {
      const isNew = (row.name === 'court_number' || row.name === 'suggested_start_time') && !existingColumns.includes(row.name);
      const prefix = isNew ? '🆕 ' : '   ';
      console.log(`${prefix}- ${row.name} (${row.type}${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ''})`);
    });

    // 既存データの確認
    console.log('');
    console.log('📊 既存データの確認...');
    const dataCount = await db.execute(`SELECT COUNT(*) as count FROM m_match_templates`);
    const totalRecords = dataCount.rows[0].count;
    
    console.log(`📋 既存レコード数: ${totalRecords}件`);

    if (totalRecords > 0) {
      // 新しいカラムの状態確認
      const sampleData = await db.execute(`
        SELECT template_id, match_code, court_number, suggested_start_time 
        FROM m_match_templates 
        LIMIT 5
      `);
      
      console.log('');
      console.log('🔍 新しいカラムの状態（上位5件）:');
      sampleData.rows.forEach(row => {
        console.log(`  - ${row.match_code}: コート=${row.court_number || 'NULL'}, 時間=${row.suggested_start_time || 'NULL'}`);
      });
    }

    console.log('');
    console.log('🎉 テーブル拡張完了！');
    console.log('');
    console.log('📝 変更内容:');
    console.log('  - court_number INTEGER カラム追加（NULL許可）');
    console.log('  - suggested_start_time TEXT カラム追加（NULL許可）');
    console.log('');
    console.log('💡 使用方法:');
    console.log('  1. court_number: 手動でコート番号を指定したい場合に設定');
    console.log('  2. suggested_start_time: 手動で開始時刻を指定したい場合に設定（HH:MM形式）');
    console.log('  3. 両方ともNULLの場合は従来通りの自動計算');
    console.log('');
    console.log('🔧 次のステップ:');
    console.log('  1. 既存の試合テンプレートに値を設定（必要に応じて）');
    console.log('  2. スケジュール計算ロジックの更新');
    console.log('  3. UI/UXの改善');

    return {
      success: true,
      addedColumns,
      totalRecords,
      existingColumns: existingColumns.length,
      newColumns: updatedTableInfo.rows.length
    };

  } catch (error) {
    console.error('');
    console.error('💥 テーブル拡張失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. DATABASE_URLとDATABASE_AUTH_TOKENが正しく設定されているか確認');
    console.error('  2. m_match_templatesテーブルが存在するか確認');
    console.error('  3. データベースへの書き込み権限があるか確認');
    console.error('  4. Tursoの制約（ALTER TABLEサポート）を確認');

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  addCourtTimeColumns()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 テーブル拡張成功！');
        console.log(`📈 統計: ${result.addedColumns}個のカラムを追加（${result.existingColumns}→${result.newColumns}カラム）`);
        process.exit(0);
      } else {
        console.error('\n💀 テーブル拡張失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { addCourtTimeColumns };