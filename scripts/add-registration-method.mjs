// scripts/add-registration-method.mjs
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

async function addRegistrationMethod() {
  try {
    console.log('t_tournament_teamsテーブルにregistration_methodカラムを追加中...\n');

    // 1. カラムを追加
    await db.execute(`
      ALTER TABLE t_tournament_teams
      ADD COLUMN registration_method TEXT DEFAULT 'self_registered'
    `);
    console.log('✓ registration_methodカラムを追加しました');

    // 2. 既存データの初期値設定
    // 管理者代行で作成されたチームのm_teams.registration_type = 'admin_proxy'の場合、
    // そのチームが参加している大会も'admin_proxy'に設定
    console.log('\n既存データの初期値を設定中...');

    const updateResult = await db.execute(`
      UPDATE t_tournament_teams
      SET registration_method = 'admin_proxy'
      WHERE team_id IN (
        SELECT team_id FROM m_teams WHERE registration_type = 'admin_proxy'
      )
    `);

    console.log(`✓ ${updateResult.rowsAffected || 0}件のレコードをadmin_proxyに更新しました`);

    // 3. 確認クエリ
    console.log('\n=== 更新結果の確認 ===');
    const countResult = await db.execute(`
      SELECT
        registration_method,
        COUNT(*) as count
      FROM t_tournament_teams
      GROUP BY registration_method
    `);

    countResult.rows.forEach(row => {
      console.log(`${row.registration_method}: ${row.count}件`);
    });

    console.log('\n✅ マイグレーション完了！');

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

addRegistrationMethod();
