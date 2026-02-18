/**
 * scripts/migrate-admin-to-login-users.mjs
 *
 * m_administrators の全レコードを m_login_users + m_login_user_roles に移行する。
 * 既にメールアドレスが m_login_users に存在する場合はスキップ。
 *
 * 使用方法:
 *   node scripts/migrate-admin-to-login-users.mjs         # dev環境
 *   node scripts/migrate-admin-to-login-users.mjs stag    # stag環境
 *   node scripts/migrate-admin-to-login-users.mjs main    # main環境
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const env = process.argv[2] || "dev";

let url, authToken;
switch (env) {
  case "stag":
    url = process.env.DATABASE_URL_STAG;
    authToken = process.env.DATABASE_AUTH_TOKEN_STAG;
    break;
  case "main":
    url = process.env.DATABASE_URL_MAIN;
    authToken = process.env.DATABASE_AUTH_TOKEN_MAIN;
    break;
  default:
    url = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
    authToken = process.env.DATABASE_AUTH_TOKEN_DEV || process.env.DATABASE_AUTH_TOKEN;
}

if (!url) {
  console.error(`ERROR: DATABASE_URL が設定されていません (env: ${env})`);
  process.exit(1);
}

const db = createClient({ url, authToken });

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  adminユーザー移行スクリプト (環境: ${env})`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// m_administrators の全レコードを取得
const admins = await db.execute(
  "SELECT administrator_id, admin_login_id, password_hash, email, organization_name FROM m_administrators"
);

console.log(`対象adminユーザー数: ${admins.rows.length}\n`);

let created = 0;
let skipped = 0;
let errors = 0;

for (const admin of admins.rows) {
  const email = admin.email;
  const displayName = admin.organization_name || admin.admin_login_id;

  process.stdout.write(`  処理中: ${email} (${admin.admin_login_id}) ... `);

  try {
    // 既に m_login_users に同じメールが存在するか確認
    const existing = await db.execute({
      sql: "SELECT login_user_id FROM m_login_users WHERE email = ?",
      args: [email]
    });

    if (existing.rows.length > 0) {
      const loginUserId = existing.rows[0].login_user_id;

      // ロールが既にあるか確認
      const existingRole = await db.execute({
        sql: "SELECT id FROM m_login_user_roles WHERE login_user_id = ? AND role = 'admin'",
        args: [loginUserId]
      });

      if (existingRole.rows.length === 0) {
        // ユーザーは存在するがadminロールがない → ロールだけ追加
        await db.execute({
          sql: "INSERT INTO m_login_user_roles (login_user_id, role) VALUES (?, 'admin')",
          args: [loginUserId]
        });
        console.log(`ロール追加済み (login_user_id: ${loginUserId})`);
        created++;
      } else {
        console.log("スキップ（既に移行済み）");
        skipped++;
      }
      continue;
    }

    // m_login_users に新規作成
    // password_hash はそのまま流用（bcrypt形式で互換性あり）
    const insertResult = await db.execute({
      sql: `INSERT INTO m_login_users (email, password_hash, display_name, is_superadmin, is_active)
            VALUES (?, ?, ?, 0, 1)`,
      args: [email, admin.password_hash, displayName]
    });

    const loginUserId = insertResult.lastInsertRowid;

    // m_login_user_roles に "admin" ロールを追加
    await db.execute({
      sql: "INSERT INTO m_login_user_roles (login_user_id, role) VALUES (?, 'admin')",
      args: [loginUserId]
    });

    console.log(`作成完了 (login_user_id: ${loginUserId})`);
    created++;

  } catch (err) {
    console.log(`エラー: ${err.message}`);
    errors++;
  }
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  移行結果:`);
console.log(`  ✓ 作成: ${created}件`);
console.log(`  ⊘ スキップ: ${skipped}件`);
console.log(`  ✗ エラー: ${errors}件`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

if (errors > 0) {
  process.exit(1);
}

// 移行後の確認
const loginUsers = await db.execute(
  `SELECT u.login_user_id, u.email, u.display_name, u.is_superadmin,
          GROUP_CONCAT(r.role) as roles
   FROM m_login_users u
   LEFT JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
   GROUP BY u.login_user_id`
);

console.log("m_login_users の現在の内容:");
console.log("─────────────────────────────────────────────────────");
console.log("ID  | メールアドレス           | 表示名         | ロール  | super");
console.log("─────────────────────────────────────────────────────");
for (const row of loginUsers.rows) {
  console.log(
    `${String(row.login_user_id).padEnd(3)} | ${String(row.email).padEnd(24)} | ${String(row.display_name).padEnd(14)} | ${String(row.roles || "").padEnd(8)} | ${row.is_superadmin ? "YES" : "no"}`
  );
}
console.log("─────────────────────────────────────────────────────\n");
