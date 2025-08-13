#!/usr/bin/env node

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// 修正対象のテーブルとフィールド定義
const tablesToFix = [
  {
    name: 'm_venues',
    fields: [
      { name: 'venue_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'venue_name', type: 'TEXT NOT NULL' },
      { name: 'address', type: 'TEXT' },
      { name: 'available_courts', type: 'INTEGER NOT NULL DEFAULT 4' },
      { name: 'is_active', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" }
    ]
  },
  {
    name: 'm_players', 
    fields: [
      { name: 'player_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'player_name', type: 'TEXT NOT NULL' },
      { name: 'jersey_number', type: 'INTEGER' },
      { name: 'current_team_id', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'FOREIGN KEY (current_team_id)', type: 'REFERENCES m_teams(team_id)' }
    ]
  },
  {
    name: 'm_tournament_formats',
    fields: [
      { name: 'format_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'format_name', type: 'TEXT NOT NULL' },
      { name: 'target_team_count', type: 'INTEGER NOT NULL' },
      { name: 'format_description', type: 'TEXT' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" }
    ]
  },
  {
    name: 't_tournament_teams',
    fields: [
      { name: 'tournament_team_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'tournament_id', type: 'INTEGER NOT NULL' },
      { name: 'team_id', type: 'TEXT NOT NULL' },
      { name: 'team_name', type: 'TEXT' },
      { name: 'team_omission', type: 'TEXT' },
      { name: 'assigned_block', type: 'TEXT' },
      { name: 'block_position', type: 'INTEGER' },
      { name: 'withdrawal_status', type: 'TEXT DEFAULT "active"' },
      { name: 'withdrawal_reason', type: 'TEXT' },
      { name: 'withdrawal_requested_at', type: 'DATETIME' },
      { name: 'withdrawal_processed_at', type: 'DATETIME' },
      { name: 'withdrawal_processed_by', type: 'TEXT' },
      { name: 'withdrawal_admin_comment', type: 'TEXT' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'FOREIGN KEY (tournament_id)', type: 'REFERENCES t_tournaments(tournament_id)' },
      { name: 'FOREIGN KEY (team_id)', type: 'REFERENCES m_teams(team_id)' }
    ]
  },
  {
    name: 't_match_blocks',
    fields: [
      { name: 'match_block_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'tournament_id', type: 'INTEGER NOT NULL' },
      { name: 'phase', type: 'TEXT NOT NULL' },
      { name: 'display_round_name', type: 'TEXT' },
      { name: 'block_name', type: 'TEXT NOT NULL' },
      { name: 'match_type', type: 'TEXT NOT NULL' },
      { name: 'block_order', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'team_rankings', type: 'TEXT' },
      { name: 'remarks', type: 'TEXT' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'FOREIGN KEY (tournament_id)', type: 'REFERENCES t_tournaments(tournament_id)' }
    ]
  },
  {
    name: 't_tournament_players',
    fields: [
      { name: 'tournament_player_id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
      { name: 'tournament_id', type: 'INTEGER NOT NULL' },
      { name: 'team_id', type: 'TEXT NOT NULL' },
      { name: 'player_id', type: 'INTEGER NOT NULL' },
      { name: 'jersey_number', type: 'INTEGER NOT NULL' },
      { name: 'player_status', type: 'TEXT NOT NULL DEFAULT "active"' },
      { name: 'registration_date', type: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
      { name: 'withdrawal_date', type: 'DATETIME' },
      { name: 'remarks', type: 'TEXT' },
      { name: 'created_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'FOREIGN KEY (tournament_id)', type: 'REFERENCES t_tournaments(tournament_id)' },
      { name: 'FOREIGN KEY (team_id)', type: 'REFERENCES m_teams(team_id)' },
      { name: 'FOREIGN KEY (player_id)', type: 'REFERENCES m_players(player_id)' }
    ]
  },
  {
    name: 't_match_status',
    fields: [
      { name: 'match_id', type: 'INTEGER PRIMARY KEY' },
      { name: 'match_block_id', type: 'INTEGER NOT NULL' },
      { name: 'match_status', type: 'TEXT NOT NULL DEFAULT "scheduled" CHECK (match_status IN ("scheduled", "ongoing", "completed", "cancelled"))' },
      { name: 'actual_start_time', type: 'DATETIME' },
      { name: 'actual_end_time', type: 'DATETIME' },
      { name: 'current_period', type: 'INTEGER DEFAULT 1' },
      { name: 'updated_by', type: 'TEXT' },
      { name: 'updated_at', type: "DATETIME DEFAULT (datetime('now', '+9 hours'))" },
      { name: 'FOREIGN KEY (match_block_id)', type: 'REFERENCES t_match_blocks(match_block_id)' }
    ]
  }
];

async function fixTableTimezone(tableConfig) {
  const tableName = tableConfig.name;
  console.log(`🔧 ${tableName} 修正中...`);
  
  try {
    // 1. バックアップテーブル作成
    await db.execute(`CREATE TABLE IF NOT EXISTS ${tableName}_backup AS SELECT * FROM ${tableName}`);
    
    // 2. 新テーブル作成
    await db.execute(`DROP TABLE IF EXISTS ${tableName}_new`);
    
    const fieldDefinitions = tableConfig.fields
      .filter(field => !field.name.startsWith('FOREIGN KEY'))
      .map(field => `${field.name} ${field.type}`)
      .join(',\n        ');
    
    const foreignKeys = tableConfig.fields
      .filter(field => field.name.startsWith('FOREIGN KEY'))
      .map(field => `${field.name} ${field.type}`)
      .join(',\n        ');
    
    const createTableSql = `
      CREATE TABLE ${tableName}_new (
        ${fieldDefinitions}${foreignKeys ? ',\n        ' + foreignKeys : ''}
      )
    `;
    
    await db.execute(createTableSql);
    
    // 3. データ移行（既存のデータがある場合）
    const count = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    if (count.rows[0].count > 0) {
      // 全カラム名取得
      const schema = await db.execute(`PRAGMA table_info(${tableName})`);
      const columns = schema.rows.map(row => row.name).join(', ');
      
      await db.execute(`
        INSERT INTO ${tableName}_new (${columns})
        SELECT ${columns} FROM ${tableName}
      `);
    }
    
    // 4. テーブル入れ替え
    await db.execute(`DROP TABLE ${tableName}`);
    await db.execute(`ALTER TABLE ${tableName}_new RENAME TO ${tableName}`);
    
    console.log(`✅ ${tableName} 修正完了 (${count.rows[0].count}件移行)`);
    
  } catch (error) {
    console.error(`❌ ${tableName} 修正エラー:`, error);
    throw error;
  }
}

async function fixAllTablesTimezone() {
  console.log('🚀 全テーブルのタイムゾーン修正開始...\n');
  
  try {
    for (const tableConfig of tablesToFix) {
      await fixTableTimezone(tableConfig);
    }
    
    console.log('\n🎉 全テーブルのタイムゾーン修正完了！');
    
    // 確認
    console.log('\n📊 修正結果確認中...');
    await new Promise(resolve => {
      const { spawn } = require('child_process');
      const check = spawn('node', ['scripts/check-all-timezone.js']);
      check.stdout.on('data', (data) => process.stdout.write(data));
      check.stderr.on('data', (data) => process.stderr.write(data));
      check.on('close', resolve);
    });
    
  } catch (error) {
    console.error('❌ 一括修正エラー:', error);
  } finally {
    db.close();
  }
}

fixAllTablesTimezone();