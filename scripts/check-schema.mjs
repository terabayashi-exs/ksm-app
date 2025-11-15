import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
const envPath = join(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;

  const equalIndex = trimmed.indexOf('=');
  if (equalIndex === -1) return;

  const key = trimmed.substring(0, equalIndex).trim();
  let value = trimmed.substring(equalIndex + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  envVars[key] = value;
});

const db = createClient({
  url: envVars.DATABASE_URL,
  authToken: envVars.DATABASE_AUTH_TOKEN
});

async function checkSchema() {
  console.log('=== t_tournament_players スキーマ確認 ===\n');

  // テーブル構造を確認
  const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_players)`);
  console.log('カラム情報:');
  tableInfo.rows.forEach(row => {
    console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : ''} ${row.pk ? 'PRIMARY KEY' : ''}`);
  });

  console.log('\n外部キー情報:');
  const foreignKeys = await db.execute(`PRAGMA foreign_key_list(t_tournament_players)`);
  foreignKeys.rows.forEach(row => {
    console.log(`  ${row.from} -> ${row.table}.${row.to}`);
  });

  console.log('\n\n=== t_tournaments スキーマ確認 ===\n');

  const tournamentInfo = await db.execute(`PRAGMA table_info(t_tournaments)`);
  console.log('カラム情報:');
  tournamentInfo.rows.forEach(row => {
    console.log(`  ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : ''} ${row.pk ? 'PRIMARY KEY' : ''}`);
  });

  console.log('\n外部キー制約の状態:');
  const fkStatus = await db.execute(`PRAGMA foreign_keys`);
  console.log(`  foreign_keys = ${fkStatus.rows[0].foreign_keys}`);
}

checkSchema().catch(console.error);
