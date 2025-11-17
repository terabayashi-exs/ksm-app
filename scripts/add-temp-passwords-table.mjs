// Migration script to add t_temporary_passwords table
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function addTempPasswordsTable() {
  try {
    console.log('Creating t_temporary_passwords table...');

    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_temporary_passwords (
        temp_password_id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id TEXT NOT NULL,
        temporary_password TEXT NOT NULL,
        is_sent INTEGER NOT NULL DEFAULT 0,
        sent_at DATETIME,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        expires_at DATETIME,
        FOREIGN KEY (team_id) REFERENCES m_teams(team_id)
      )
    `);

    console.log('✓ t_temporary_passwords table created successfully');

    // Create index for faster lookups
    console.log('Creating indexes...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_temp_passwords_team ON t_temporary_passwords(team_id)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_temp_passwords_sent ON t_temporary_passwords(is_sent)
    `);

    console.log('✓ Indexes created successfully');

    // Verify table creation
    const result = await db.execute(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='t_temporary_passwords'
    `);

    if (result.rows.length > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('Table t_temporary_passwords is now available.');
    } else {
      console.error('❌ Table creation verification failed');
    }

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

addTempPasswordsTable();
