import { createClient } from "@libsql/client";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function fixConstraints() {
  try {
    console.log('Fixing unique constraints...');
    
    // テーブルを削除して再作成
    await db.execute(`DROP TABLE IF EXISTS t_tournament_players`);
    console.log('Dropped existing table');
    
    // 背番号のUNIQUE制約を調整（NULLの場合は重複を許可）
    await db.execute(`
      CREATE TABLE t_tournament_players (
        tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        jersey_number INTEGER,
        player_status TEXT NOT NULL DEFAULT 'active',
        registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        withdrawal_date DATETIME,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
        FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (player_id) REFERENCES m_players(player_id),
        UNIQUE(tournament_id, team_id, player_id)
      )
    `);
    console.log('Created table without jersey_number unique constraint');
    
    // 背番号の重複チェック用のインデックス（NULLを除く）
    await db.execute(`
      CREATE UNIQUE INDEX idx_tournament_players_jersey_unique 
      ON t_tournament_players(tournament_id, team_id, jersey_number) 
      WHERE jersey_number IS NOT NULL
    `);
    console.log('Created unique index for jersey numbers (excluding NULL)');
    
    // その他のインデックス
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_team 
      ON t_tournament_players(tournament_id, team_id)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_player 
      ON t_tournament_players(player_id)
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_status 
      ON t_tournament_players(player_status)
    `);
    
    console.log('Created other indexes');
    
    // 新しいテーブル構造を確認
    const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_players)`);
    console.log('Final table structure:');
    tableInfo.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : 'NULL'} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
    // インデックス確認
    const indexes = await db.execute(`PRAGMA index_list(t_tournament_players)`);
    console.log('Indexes:');
    indexes.rows.forEach(row => {
      console.log(`  ${row.name}: unique=${row.unique}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

fixConstraints();