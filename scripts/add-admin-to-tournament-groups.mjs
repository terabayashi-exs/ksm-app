// t_tournament_groupsテーブルにadmin_login_idカラムを追加
// サブスクリプション機能で管理者ごとの大会数をカウントするために必要

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function addAdminToTournamentGroups() {
  console.log('=== t_tournament_groups に admin_login_id カラムを追加 ===\n');

  try {
    // 1. テーブル構造確認
    console.log('1. テーブル構造確認中...');
    const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_groups)`);
    const columnNames = tableInfo.rows.map(row => row.name);

    console.log(`  既存カラム: ${columnNames.join(', ')}`);
    console.log('');

    // 2. admin_login_id カラムの追加
    if (!columnNames.includes('admin_login_id')) {
      console.log('2. admin_login_id カラムを追加中...');
      await db.execute(`
        ALTER TABLE t_tournament_groups
        ADD COLUMN admin_login_id TEXT REFERENCES m_administrators(admin_login_id)
      `);
      console.log('  ✓ admin_login_id カラム追加完了');
      console.log('');
    } else {
      console.log('2. admin_login_id カラムは既に存在します');
      console.log('');
    }

    // 3. 既存の大会データに管理者IDを設定
    console.log('3. 既存大会データの更新中...');

    // 最初の管理者を取得
    const adminResult = await db.execute(`SELECT admin_login_id FROM m_administrators LIMIT 1`);

    if (adminResult.rows.length === 0) {
      console.log('  ⚠️  管理者が見つかりません。スキップします。');
    } else {
      const firstAdminId = adminResult.rows[0].admin_login_id;
      console.log(`  デフォルト管理者ID: ${firstAdminId}`);

      // admin_login_idがNULLの大会を最初の管理者に割り当て
      const updateResult = await db.execute(
        `UPDATE t_tournament_groups
         SET admin_login_id = ?
         WHERE admin_login_id IS NULL`,
        [firstAdminId]
      );

      console.log(`  ✓ ${updateResult.rowsAffected || 0} 件の大会を更新`);
    }
    console.log('');

    // 4. インデックス作成
    console.log('4. インデックス作成中...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_groups_admin
      ON t_tournament_groups(admin_login_id)
    `);
    console.log('  ✓ インデックス作成完了');
    console.log('');

    // 5. 確認
    console.log('5. 結果確認...');
    const groupsResult = await db.execute(`
      SELECT admin_login_id, COUNT(*) as count
      FROM t_tournament_groups
      GROUP BY admin_login_id
    `);

    console.log('  管理者別大会数:');
    for (const row of groupsResult.rows) {
      console.log(`    ${row.admin_login_id || 'NULL'}: ${row.count}大会`);
    }
    console.log('');

    console.log('=== マイグレーション完了 ===\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

addAdminToTournamentGroups();
