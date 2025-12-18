#!/usr/bin/env node
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

console.log('🔍 Checking for duplicate players in m_players...\n');

// 重複している選手を検索（同じcurrent_team_idとplayer_nameを持つレコード）
const duplicatesQuery = `
  SELECT
    current_team_id,
    player_name,
    COUNT(*) as count,
    GROUP_CONCAT(player_id) as player_ids
  FROM m_players
  WHERE current_team_id IS NOT NULL
  GROUP BY current_team_id, player_name
  HAVING count > 1
  ORDER BY current_team_id, player_name
`;

const result = await db.execute(duplicatesQuery);

if (result.rows.length === 0) {
  console.log('✅ No duplicate players found!');
  process.exit(0);
}

console.log(`⚠️  Found ${result.rows.length} duplicate player name(s):\n`);

let totalDuplicateRecords = 0;

for (const row of result.rows) {
  const teamId = row.current_team_id;
  const playerName = row.player_name;
  const count = row.count;
  const playerIds = String(row.player_ids).split(',').map(id => parseInt(id));

  totalDuplicateRecords += count - 1; // 1つは正しいレコードなので除外

  console.log(`📝 Team: ${teamId}`);
  console.log(`   Player: ${playerName}`);
  console.log(`   Count: ${count} records`);
  console.log(`   Player IDs: ${playerIds.join(', ')}`);

  // 各player_idの詳細情報を取得
  for (const playerId of playerIds) {
    const detailResult = await db.execute(
      `SELECT player_id, player_name, jersey_number, is_active, created_at, updated_at
       FROM m_players WHERE player_id = ?`,
      [playerId]
    );

    const detail = detailResult.rows[0];
    console.log(`     - ID ${playerId}: jersey=${detail.jersey_number || 'null'}, active=${detail.is_active}, created=${detail.created_at}`);
  }

  console.log('');
}

console.log(`\n📊 Summary:`);
console.log(`   Duplicate player names: ${result.rows.length}`);
console.log(`   Total duplicate records to remove: ${totalDuplicateRecords}`);
console.log(`\n💡 Run 'node scripts/remove-duplicate-players.mjs' to clean up duplicates.`);
