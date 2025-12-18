#!/usr/bin/env node

/**
 * マイグレーションスクリプト: win_condition カラム削除
 *
 * t_tournament_rules テーブルから win_condition カラムを削除します。
 * このフィールドは保存されていましたが、実際のロジックでは使用されていませんでした。
 */

import { createClient } from '@libsql/client';

// 開発版データベース設定（FALLBACK_CONFIG と同じ）
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function migrate() {
  console.log('🚀 マイグレーション開始: win_condition カラム削除\n');

  try {
    // 1. カラムの存在チェック
    console.log('📋 Step 1: 既存カラムの確認...');
    const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_rules)`);
    const hasWinCondition = tableInfo.rows.some(
      (row) => row.name === 'win_condition'
    );

    if (!hasWinCondition) {
      console.log('✅ win_condition カラムは既に削除されています');
      console.log('⏭️  マイグレーションをスキップします\n');
      return;
    }

    console.log('📝 win_condition カラムが見つかりました。削除処理を開始します...\n');

    // 2. データ確認
    console.log('📊 Step 2: 既存データの確認...');
    const stats = await db.execute(`
      SELECT
        win_condition,
        COUNT(*) as count
      FROM t_tournament_rules
      GROUP BY win_condition
    `);

    console.log('   win_condition の集計:');
    stats.rows.forEach((row) => {
      console.log(`   - ${row.win_condition}: ${row.count} レコード`);
    });
    console.log('');

    // 3. SQLiteの制限により、テーブル再作成が必要
    console.log('📝 Step 3: テーブル再作成処理...');
    console.log('   ⚠️  SQLiteではALTER TABLE DROP COLUMNが制限されているため、テーブルを再作成します');

    // 一時テーブルにデータをバックアップ
    console.log('   3-1: データをバックアップ中...');
    await db.execute(`
      CREATE TABLE t_tournament_rules_backup AS
      SELECT
        tournament_rule_id,
        tournament_id,
        phase,
        use_extra_time,
        use_penalty,
        active_periods,
        notes,
        point_system,
        walkover_settings,
        tie_breaking_rules,
        tie_breaking_enabled,
        created_at,
        updated_at
      FROM t_tournament_rules
    `);
    console.log('   ✅ バックアップ完了');

    // 既存テーブル削除
    console.log('   3-2: 既存テーブルを削除中...');
    await db.execute(`DROP TABLE t_tournament_rules`);
    console.log('   ✅ 削除完了');

    // 新テーブル作成（win_conditionなし）
    console.log('   3-3: 新テーブルを作成中...');
    await db.execute(`
      CREATE TABLE t_tournament_rules (
        tournament_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('preliminary', 'final')),
        use_extra_time INTEGER DEFAULT 0,
        use_penalty INTEGER DEFAULT 0,
        active_periods TEXT DEFAULT '["1"]',
        notes TEXT,
        point_system TEXT,
        walkover_settings TEXT,
        tie_breaking_rules TEXT,
        tie_breaking_enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', '+9 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ 新テーブル作成完了');

    // データを復元
    console.log('   3-4: データを復元中...');
    await db.execute(`
      INSERT INTO t_tournament_rules
      SELECT * FROM t_tournament_rules_backup
    `);
    console.log('   ✅ データ復元完了');

    // バックアップテーブル削除
    console.log('   3-5: バックアップテーブルを削除中...');
    await db.execute(`DROP TABLE t_tournament_rules_backup`);
    console.log('   ✅ バックアップテーブル削除完了\n');

    // 4. 最終確認
    console.log('📊 Step 4: 最終確認...');
    const finalTableInfo = await db.execute(`PRAGMA table_info(t_tournament_rules)`);
    const columns = finalTableInfo.rows.map((row) => row.name);
    console.log('   現在のカラム一覧:', columns.join(', '));

    if (!columns.includes('win_condition')) {
      console.log('   ✅ win_condition カラムが正常に削除されました');
    } else {
      console.log('   ❌ win_condition カラムがまだ存在しています');
      process.exit(1);
    }

    const recordCount = await db.execute(`SELECT COUNT(*) as count FROM t_tournament_rules`);
    console.log(`   ✅ 全${recordCount.rows[0].count}レコードが正常に保持されています\n`);

    console.log('✅ マイグレーション完了！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    console.error('\n詳細:', error instanceof Error ? error.message : 'Unknown error');
    console.error('\n⚠️  エラーが発生しました。データベースの状態を確認してください。');
    process.exit(1);
  }
}

// 実行
migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });
