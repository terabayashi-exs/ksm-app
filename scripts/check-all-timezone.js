#!/usr/bin/env node

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkAllTablesTimezone() {
  try {
    console.log('🔍 全テーブルのタイムゾーン設定をチェック中...\n');
    
    // 全テーブル一覧を取得
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_backup'");
    
    const problemTables = [];
    
    for (const table of tables.rows) {
      const tableName = table.name;
      console.log(`=== ${tableName} ===`);
      
      const schema = await db.execute(`PRAGMA table_info(${tableName})`);
      const timeFields = schema.rows.filter(row => 
        (row.name === 'created_at' || row.name === 'updated_at') && row.dflt_value
      );
      
      if (timeFields.length > 0) {
        timeFields.forEach(field => {
          const isJST = field.dflt_value && field.dflt_value.includes("'+9 hours'");
          const status = isJST ? '✅' : '❌';
          console.log(`  ${field.name}: ${field.dflt_value} ${status}`);
          
          if (!isJST) {
            problemTables.push({
              table: tableName,
              field: field.name,
              current: field.dflt_value
            });
          }
        });
      } else {
        console.log('  タイムスタンプフィールドなし');
      }
      console.log('');
    }
    
    if (problemTables.length > 0) {
      console.log('⚠️  修正が必要なテーブル:');
      problemTables.forEach(item => {
        console.log(`  - ${item.table}.${item.field}: ${item.current}`);
      });
    } else {
      console.log('🎉 すべてのテーブルが日本時間設定になっています！');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    db.close();
  }
}

checkAllTablesTimezone();