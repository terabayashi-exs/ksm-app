// 順位決定ルール機能のためのスキーマ更新スクリプト
const { createClient } = require('@libsql/client');
const fs = require('fs');

// 環境変数の設定値
const DATABASE_URL = "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io";
const DATABASE_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA";

const client = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN,
});

const sqlStatements = [
  `ALTER TABLE t_tournament_rules ADD COLUMN tie_breaking_rules TEXT`,
  `ALTER TABLE t_tournament_rules ADD COLUMN tie_breaking_enabled INTEGER DEFAULT 1`,
  `CREATE INDEX IF NOT EXISTS idx_tournament_rules_tournament_phase ON t_tournament_rules(tournament_id, phase)`,
  `INSERT INTO sample_data (value) VALUES ('tie_breaking_rules_schema_updated_' || datetime('now', '+9 hours'))`
];

async function updateSchema() {
  try {
    console.log('🔧 スキーマ更新を開始...');
    
    for (const stmt of sqlStatements) {
      try {
        await client.execute(stmt);
        console.log('✅', stmt.substring(0, 60) + '...');
      } catch (error) {
        if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
          console.log('⚠️  Already exists:', stmt.substring(0, 60) + '...');
        } else {
          throw error;
        }
      }
    }
    
    console.log('🎉 スキーマ更新が完了しました');
    
    // 更新後のテーブル構造を確認
    const result = await client.execute(`PRAGMA table_info(t_tournament_rules)`);
    console.log('\n📋 更新後のt_tournament_rulesテーブル構造:');
    result.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ スキーマ更新エラー:', error);
  } finally {
    await client.close();
  }
}

updateSchema();