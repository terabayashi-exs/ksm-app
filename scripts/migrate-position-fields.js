// m_match_templatesテーブルに順位決定フィールドを追加するマイグレーション
const { createClient } = require('@libsql/client');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function migratePositionFields() {
  console.log('🔄 順位決定フィールド追加マイグレーション開始...');
  
  try {
    // SQLファイルを読み込み
    const sqlFile = fs.readFileSync('./scripts/add-position-fields.sql', 'utf8');
    const statements = sqlFile.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`実行中: ${statement.trim().substring(0, 50)}...`);
        await db.execute(statement.trim());
      }
    }
    
    console.log('✅ マイグレーション完了');
    
    // テーブル構造確認
    console.log('\n📋 更新後のテーブル構造:');
    const result = await db.execute('PRAGMA table_info(m_match_templates)');
    result.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

migratePositionFields()
  .then(() => {
    console.log('🎉 マイグレーション正常完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 マイグレーション失敗:', error);
    process.exit(1);
  });