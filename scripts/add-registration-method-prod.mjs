// scripts/add-registration-method-prod.mjs
// 本番環境（ksm-main）用のマイグレーションスクリプト
import { createClient } from '@libsql/client';

// 本番用データベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

const db = createClient({
  url: PROD_DB_URL,
  authToken: PROD_DB_AUTH_TOKEN,
});

async function addRegistrationMethod() {
  try {
    console.log('=== 本番環境（ksm-main）マイグレーション ===');
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

    // 4. サンプルデータ表示
    console.log('\n=== サンプルデータ（最初の3件）===');
    const sampleResult = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        tt.registration_method,
        m.registration_type as master_registration_type,
        m.team_name as master_team_name
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      ORDER BY tt.tournament_team_id
      LIMIT 3
    `);

    sampleResult.rows.forEach((row, index) => {
      console.log(`\n${index + 1}. チーム: ${row.tournament_team_name}`);
      console.log(`   team_id: ${row.team_id}`);
      console.log(`   大会参加方法 (registration_method): ${row.registration_method}`);
      console.log(`   マスター登録方法 (master_registration_type): ${row.master_registration_type}`);
    });

    console.log('\n✅ マイグレーション完了！');

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

addRegistrationMethod();
