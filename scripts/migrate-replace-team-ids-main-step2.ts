/**
 * team_id UUID化: STEP 2 - データ入れ替え
 *
 * _new テーブルにUUID変換済みデータが入っている状態から、
 * 旧テーブルのデータをDELETE→新テーブルからINSERTする。
 *
 * FK依存順:
 *   t_email_send_history → t_tournament_teams → m_teams
 *   t_tournament_players → m_teams, m_players
 *   m_players → m_teams
 *
 * 使用方法:
 *   npx tsx scripts/migrate-replace-team-ids-main-step2.ts
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  team_id UUID化 STEP 2: データ入れ替え');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 新テーブルの件数確認
  console.log('[確認] 新テーブルの件数\n');
  for (const t of ['m_teams_new', 'm_players_new', 't_tournament_teams_new', 't_tournament_players_new']) {
    try {
      const cnt = await db.execute(`SELECT COUNT(*) as cnt FROM ${t}`);
      console.log(`  ${t}: ${cnt.rows[0].cnt}件`);
    } catch {
      console.log(`  ${t}: テーブルなし`);
    }
  }

  // STEP 1: email_send_historyを一時テーブルに退避
  console.log('\n[STEP 1] t_email_send_history を退避\n');

  await db.execute('DROP TABLE IF EXISTS t_email_send_history_backup');
  await db.execute('CREATE TABLE t_email_send_history_backup AS SELECT * FROM t_email_send_history');
  const emailCount = await db.execute('SELECT COUNT(*) as cnt FROM t_email_send_history_backup');
  console.log(`  ✓ ${emailCount.rows[0].cnt}件退避`);

  // STEP 2: 子テーブルのデータをDELETE（FK依存順）
  console.log('\n[STEP 2] 旧テーブルのデータ削除（FK依存順）\n');

  await db.execute('DELETE FROM t_email_send_history');
  console.log('  ✓ t_email_send_history DELETE完了');

  // t_tournament_playersは前回のstep2で既にDELETE済み（0件）
  await db.execute('DELETE FROM t_tournament_players');
  console.log('  ✓ t_tournament_players DELETE完了');

  await db.execute('DELETE FROM t_tournament_teams');
  console.log('  ✓ t_tournament_teams DELETE完了');

  await db.execute('DELETE FROM t_password_reset_tokens');
  console.log('  ✓ t_password_reset_tokens DELETE完了');

  await db.execute('DELETE FROM t_team_invitations');
  console.log('  ✓ t_team_invitations DELETE完了');

  await db.execute('DELETE FROM m_players');
  console.log('  ✓ m_players DELETE完了');

  await db.execute('DELETE FROM m_teams');
  console.log('  ✓ m_teams DELETE完了');

  // STEP 3: 親テーブルからINSERT
  console.log('\n[STEP 3] UUID化データ投入\n');

  await db.execute(`
    INSERT INTO m_teams (team_id, team_name, team_omission, contact_person, contact_email,
      contact_phone, representative_player_id, password_hash, is_active, created_at, updated_at,
      registration_type, prefecture_id)
    SELECT team_id, team_name, team_omission, contact_person, contact_email,
      contact_phone, representative_player_id, password_hash, is_active, created_at, updated_at,
      registration_type, prefecture_id
    FROM m_teams_new
  `);
  const mtCount = await db.execute('SELECT COUNT(*) as cnt FROM m_teams');
  console.log(`  ✓ m_teams: ${mtCount.rows[0].cnt}件`);

  await db.execute(`
    INSERT INTO m_players (player_id, player_name, jersey_number, current_team_id, is_active, created_at, updated_at)
    SELECT player_id, player_name, jersey_number, current_team_id, is_active, created_at, updated_at
    FROM m_players_new
  `);
  const mpCount = await db.execute('SELECT COUNT(*) as cnt FROM m_players');
  console.log(`  ✓ m_players: ${mpCount.rows[0].cnt}件`);

  await db.execute(`
    INSERT INTO t_tournament_teams (tournament_team_id, tournament_id, team_id, assigned_block,
      block_position, created_at, updated_at, team_name, team_omission, withdrawal_status,
      withdrawal_reason, withdrawal_requested_at, withdrawal_processed_at, withdrawal_processed_by,
      withdrawal_admin_comment, registration_method, participation_status, waitlist_position)
    SELECT tournament_team_id, tournament_id, team_id, assigned_block,
      block_position, created_at, updated_at, team_name, team_omission, withdrawal_status,
      withdrawal_reason, withdrawal_requested_at, withdrawal_processed_at, withdrawal_processed_by,
      withdrawal_admin_comment, registration_method, participation_status, waitlist_position
    FROM t_tournament_teams_new
  `);
  const ttCount = await db.execute('SELECT COUNT(*) as cnt FROM t_tournament_teams');
  console.log(`  ✓ t_tournament_teams: ${ttCount.rows[0].cnt}件`);

  await db.execute(`
    INSERT INTO t_tournament_players (tournament_player_id, tournament_id, team_id, player_id,
      jersey_number, player_status, registration_date, withdrawal_date, remarks,
      created_at, updated_at, player_name, player_omission, tournament_team_id)
    SELECT tournament_player_id, tournament_id, team_id, player_id,
      jersey_number, player_status, registration_date, withdrawal_date, remarks,
      created_at, updated_at, player_name, player_omission, tournament_team_id
    FROM t_tournament_players_new
  `);
  const tpCount = await db.execute('SELECT COUNT(*) as cnt FROM t_tournament_players');
  console.log(`  ✓ t_tournament_players: ${tpCount.rows[0].cnt}件`);

  // t_email_send_history を復元（tournament_team_idは変わらないのでそのまま）
  await db.execute(`
    INSERT INTO t_email_send_history
    SELECT * FROM t_email_send_history_backup
  `);
  const emailRestored = await db.execute('SELECT COUNT(*) as cnt FROM t_email_send_history');
  console.log(`  ✓ t_email_send_history: ${emailRestored.rows[0].cnt}件復元`);

  // STEP 4: クリーンアップ
  console.log('\n[STEP 4] クリーンアップ\n');

  for (const t of ['m_teams_new', 'm_players_new', 't_tournament_teams_new', 't_tournament_players_new', 't_password_reset_tokens_new', 't_team_invitations_new', 't_email_send_history_backup', '_team_id_mapping']) {
    await db.execute(`DROP TABLE IF EXISTS ${t}`);
  }
  console.log('  ✓ 一時テーブル削除完了');

  // STEP 5: 整合性チェック
  console.log('\n[STEP 5] 整合性チェック\n');

  const nonUuid = await db.execute("SELECT COUNT(*) as cnt FROM m_teams WHERE length(team_id) != 36");
  console.log(`  UUID形式でないteam_id: ${nonUuid.rows[0].cnt}件`);

  for (const [table, col] of [
    ['t_tournament_teams', 'team_id'],
    ['t_tournament_players', 'team_id'],
    ['m_players', 'current_team_id'],
  ] as const) {
    const orphans = await db.execute(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} NOT IN (SELECT team_id FROM m_teams)`);
    console.log(`  ${table}.${col} 孤立: ${orphans.rows[0].cnt}件`);
  }

  // 件数確認
  console.log('\n  --- 件数確認 ---');
  for (const table of ['m_teams', 'm_players', 't_tournament_teams', 't_tournament_players', 't_password_reset_tokens', 't_team_invitations', 't_email_send_history']) {
    const cnt = await db.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`  ${table}: ${cnt.rows[0].cnt}件`);
  }

  // サンプル
  console.log('\n[STEP 6] サンプル確認\n');
  const sample = await db.execute('SELECT team_id, team_name FROM m_teams LIMIT 5');
  sample.rows.forEach(r => console.log('  ' + r.team_id + ' → ' + r.team_name));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ team_id UUID化 完了');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  db.close();
}

main().catch(e => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
