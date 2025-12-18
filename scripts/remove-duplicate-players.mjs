#!/usr/bin/env node
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

console.log('🧹 Removing duplicate players from m_players...\n');

// 重複している選手を検索
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

console.log(`⚠️  Found ${result.rows.length} duplicate player name(s).\n`);

let totalDeleted = 0;
const deletedIds = [];

for (const row of result.rows) {
  const teamId = row.current_team_id;
  const playerName = row.player_name;
  const playerIds = String(row.player_ids).split(',').map(id => parseInt(id));

  // 各player_idの詳細情報を取得
  const details = [];
  for (const playerId of playerIds) {
    const detailResult = await db.execute(
      `SELECT player_id, created_at, is_active FROM m_players WHERE player_id = ?`,
      [playerId]
    );
    details.push({
      player_id: playerId,
      created_at: detailResult.rows[0].created_at,
      is_active: detailResult.rows[0].is_active
    });
  }

  // created_atでソート（古い順）
  details.sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return dateA - dateB;
  });

  // 最新のレコード（最後の要素）を保持、それ以外を削除
  const toKeep = details[details.length - 1].player_id;
  const toDelete = details.slice(0, -1).map(d => d.player_id);

  console.log(`📝 Team: ${teamId}, Player: ${playerName}`);
  console.log(`   Keeping player_id: ${toKeep} (latest)`);
  console.log(`   Deleting player_id(s): ${toDelete.join(', ')}`);

  // 削除実行
  for (const playerId of toDelete) {
    await db.execute(`DELETE FROM m_players WHERE player_id = ?`, [playerId]);
    deletedIds.push(playerId);
    totalDeleted++;
  }
}

console.log(`\n✅ Cleanup completed!`);
console.log(`   Total duplicate records removed: ${totalDeleted}`);
console.log(`   Deleted player IDs: ${deletedIds.join(', ')}`);
