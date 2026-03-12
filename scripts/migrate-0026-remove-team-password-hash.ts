/**
 * マイグレーションスクリプト: 0026 - 旧チームログイン機能の完全削除
 *
 * - t_password_reset_tokens: team_id → login_user_id に移行（テーブル再作成方式）
 * - m_teams: password_hash カラムを DROP
 *
 * SQLiteでは外部キー制約を持つカラムのDROP COLUMNができないため、
 * テーブル再作成方式（CREATE新テーブル → データコピー → DROP旧テーブル → RENAME）を使用。
 *
 * 使用方法:
 *   npx tsx scripts/migrate-0026-remove-team-password-hash.ts          # dev環境
 *   npx tsx scripts/migrate-0026-remove-team-password-hash.ts stag     # stag環境
 *   npx tsx scripts/migrate-0026-remove-team-password-hash.ts main     # main環境
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const env = process.argv[2] || "dev";
const envSuffix = env === "dev" ? "" : `_${env.toUpperCase()}`;

const url = process.env[`DATABASE_URL${envSuffix}`] || process.env.DATABASE_URL;
const authToken = process.env[`DATABASE_AUTH_TOKEN${envSuffix}`] || process.env.DATABASE_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(`❌ 環境変数が見つかりません: DATABASE_URL${envSuffix}, DATABASE_AUTH_TOKEN${envSuffix}`);
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  console.log(`🔄 マイグレーション0026開始: ${env}環境`);
  console.log(`   URL: ${url}`);

  // ========================================
  // Step 1: t_password_reset_tokens テーブル再作成
  // ========================================
  console.log('\n--- Step 1: t_password_reset_tokens テーブル再作成 ---');

  // 1a. login_user_id カラムが既にあるか確認
  const colCheck = await client.execute(
    `SELECT COUNT(*) as cnt FROM pragma_table_info('t_password_reset_tokens') WHERE name = 'login_user_id'`
  );
  const hasLoginUserId = Number(colCheck.rows[0].cnt) > 0;

  // team_id カラムがまだあるか確認
  const teamColCheck = await client.execute(
    `SELECT COUNT(*) as cnt FROM pragma_table_info('t_password_reset_tokens') WHERE name = 'team_id'`
  );
  const hasTeamId = Number(teamColCheck.rows[0].cnt) > 0;

  if (!hasTeamId && hasLoginUserId) {
    console.log('   ⏭️ t_password_reset_tokens は既に移行済み');
  } else {
    // 1b. login_user_id がなければ追加（データ移行のため一時的に）
    if (!hasLoginUserId) {
      try {
        await client.execute(
          `ALTER TABLE t_password_reset_tokens ADD COLUMN login_user_id INTEGER`
        );
        console.log('   ✅ login_user_id カラム追加');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('duplicate column')) {
          console.log('   ⏭️ login_user_id カラムは既に存在');
        } else {
          throw error;
        }
      }
    }

    // 1c. データ移行: team_id → login_user_id
    if (hasTeamId) {
      await client.execute(`
        UPDATE t_password_reset_tokens
        SET login_user_id = (
          SELECT tm.login_user_id
          FROM m_team_members tm
          WHERE tm.team_id = t_password_reset_tokens.team_id
            AND tm.is_active = 1
          LIMIT 1
        )
        WHERE team_id IS NOT NULL AND login_user_id IS NULL
      `);
      console.log('   ✅ 既存トークンデータのマイグレーション完了');

      // 紐付けできなかったトークンを削除
      const deleteResult = await client.execute(
        `DELETE FROM t_password_reset_tokens WHERE login_user_id IS NULL`
      );
      console.log(`   ✅ 紐付けできなかったトークンを削除: ${deleteResult.rowsAffected}件`);
    }

    // 1d. 新テーブル作成 → データコピー → 旧テーブルDROP → RENAME
    if (hasTeamId) {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS t_password_reset_tokens_new (
          token_id INTEGER PRIMARY KEY AUTOINCREMENT,
          login_user_id INTEGER NOT NULL REFERENCES m_login_users(login_user_id) ON DELETE CASCADE,
          reset_token TEXT NOT NULL,
          expires_at NUMERIC NOT NULL,
          used_at NUMERIC,
          created_at NUMERIC DEFAULT (datetime('now', '+9 hours'))
        )
      `);
      console.log('   ✅ 新テーブル作成');

      await client.execute(`
        INSERT INTO t_password_reset_tokens_new (token_id, login_user_id, reset_token, expires_at, used_at, created_at)
        SELECT token_id, login_user_id, reset_token, expires_at, used_at, created_at
        FROM t_password_reset_tokens
        WHERE login_user_id IS NOT NULL
      `);
      console.log('   ✅ データコピー完了');

      await client.execute(`DROP TABLE t_password_reset_tokens`);
      console.log('   ✅ 旧テーブル削除');

      await client.execute(`ALTER TABLE t_password_reset_tokens_new RENAME TO t_password_reset_tokens`);
      console.log('   ✅ テーブルリネーム完了');

      // インデックス作成
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_login_user_reset_tokens ON t_password_reset_tokens(login_user_id)`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_reset_token ON t_password_reset_tokens(reset_token)`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_expires_at ON t_password_reset_tokens(expires_at)`);
      console.log('   ✅ インデックス作成完了');
    }
  }

  // ========================================
  // Step 2: m_teams.password_hash カラム削除
  // ========================================
  console.log('\n--- Step 2: m_teams.password_hash カラム削除 ---');

  const pwColCheck = await client.execute(
    `SELECT COUNT(*) as cnt FROM pragma_table_info('m_teams') WHERE name = 'password_hash'`
  );
  const hasPasswordHash = Number(pwColCheck.rows[0].cnt) > 0;

  if (!hasPasswordHash) {
    console.log('   ⏭️ password_hash は既に削除済み');
  } else {
    try {
      await client.execute(`ALTER TABLE m_teams DROP COLUMN password_hash`);
      console.log('   ✅ m_teams.password_hash カラム削除完了');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('no such column')) {
        console.log('   ⏭️ password_hash は既に削除済み');
      } else {
        console.error(`   ❌ エラー: ${msg}`);
        throw error;
      }
    }
  }

  console.log(`\n✅ マイグレーション0026完了`);
}

migrate().catch((error) => {
  console.error("❌ マイグレーションエラー:", error);
  process.exit(1);
});
