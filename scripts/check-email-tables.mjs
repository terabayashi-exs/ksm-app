import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込み
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const client = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function checkEmailTables() {
  try {
    console.log('=== メール関連テーブルの確認 ===\n');

    // t_email_send_historyテーブルの存在確認
    const tableCheck = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='t_email_send_history'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('❌ t_email_send_history テーブルが存在しません');
      console.log('\n=== 必要なDDL ===');
      console.log(`
CREATE TABLE IF NOT EXISTS t_email_send_history (
  send_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER,
  tournament_team_id INTEGER,
  sent_by TEXT NOT NULL,
  template_id TEXT,
  subject TEXT,
  sent_at TEXT DEFAULT (datetime('now', '+9 hours')),
  FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
  FOREIGN KEY (tournament_team_id) REFERENCES t_tournament_teams(tournament_team_id)
);
      `);
    } else {
      console.log('✅ t_email_send_history テーブルが存在します');

      // テーブル構造を確認
      const schema = await client.execute(`
        PRAGMA table_info(t_email_send_history)
      `);

      console.log('\nテーブル構造:');
      console.table(schema.rows);

      // レコード数を確認
      const countResult = await client.execute(`
        SELECT COUNT(*) as count FROM t_email_send_history
      `);

      console.log(`\nレコード数: ${countResult.rows[0].count}件`);
    }

    // m_teamsテーブルのcontact_emailカラム確認
    console.log('\n=== m_teamsテーブルの確認 ===');
    const teamsSchema = await client.execute(`
      PRAGMA table_info(m_teams)
    `);

    const hasContactEmail = teamsSchema.rows.some(row => row.name === 'contact_email');
    if (hasContactEmail) {
      console.log('✅ m_teams.contact_email カラムが存在します');
    } else {
      console.log('❌ m_teams.contact_email カラムが存在しません');
      console.log('\n=== 必要なDDL ===');
      console.log('ALTER TABLE m_teams ADD COLUMN contact_email TEXT;');
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    client.close();
  }
}

checkEmailTables();
