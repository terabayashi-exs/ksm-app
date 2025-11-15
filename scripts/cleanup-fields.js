// 不要なフィールドを削除するスクリプト
const { createClient } = require('@libsql/client');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function cleanupUnnecessaryFields() {
  console.log('🧹 不要フィールド削除開始...');
  
  try {
    // 現在のテーブル構造を確認
    console.log('\n📋 削除前のテーブル構造:');
    const beforeResult = await db.execute('PRAGMA table_info(m_match_templates)');
    beforeResult.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'}`);
    });

    // 削除前にフィールドの使用状況をチェック
    console.log('\n🔍 フィールド使用状況チェック:');
    
    // winner_advances_to_match_code の使用状況
    const winnerAdvancesResult = await db.execute(`
      SELECT COUNT(*) as count, COUNT(CASE WHEN winner_advances_to_match_code IS NOT NULL THEN 1 END) as non_null_count
      FROM m_match_templates
    `);
    const winnerAdvancesStats = winnerAdvancesResult.rows[0];
    console.log(`  winner_advances_to_match_code: 総行数 ${winnerAdvancesStats.count}, 値あり ${winnerAdvancesStats.non_null_count}`);

    // match_stage の使用状況
    const matchStageResult = await db.execute(`
      SELECT COUNT(*) as count, COUNT(CASE WHEN match_stage IS NOT NULL THEN 1 END) as non_null_count
      FROM m_match_templates
    `);
    const matchStageStats = matchStageResult.rows[0];
    console.log(`  match_stage: 総行数 ${matchStageStats.count}, 値あり ${matchStageStats.non_null_count}`);

    // SQLファイルを読み込み実行
    console.log('\n🗑️ 不要フィールド削除中...');
    const sqlFile = fs.readFileSync('./scripts/remove-unnecessary-fields.sql', 'utf8');
    const statements = sqlFile.split(';').filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`実行中: ${statement.trim().substring(0, 50)}...`);
        try {
          await db.execute(statement.trim());
          console.log('✅ 成功');
        } catch (error) {
          if (error.message.includes('no such column')) {
            console.log('ℹ️ フィールドは既に削除済み');
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('\n📋 削除後のテーブル構造:');
    const afterResult = await db.execute('PRAGMA table_info(m_match_templates)');
    afterResult.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('\n✅ フィールド削除完了');
    
    // 必要なフィールドのみが残っていることを確認
    const finalFields = afterResult.rows.map(row => row.name);
    const requiredFields = ['loser_position_start', 'loser_position_end', 'winner_position', 'position_note'];
    const hasAllRequired = requiredFields.every(field => finalFields.includes(field));
    
    if (hasAllRequired) {
      console.log('🎯 必要なフィールドは全て保持されています');
    } else {
      console.log('⚠️ 一部の必要なフィールドが見つかりません');
    }
    
  } catch (error) {
    console.error('❌ フィールド削除エラー:', error);
    throw error;
  }
}

cleanupUnnecessaryFields()
  .then(() => {
    console.log('🎉 フィールドクリーンアップ正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 フィールドクリーンアップ失敗:', error);
    process.exit(1);
  });