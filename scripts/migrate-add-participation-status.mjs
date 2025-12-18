#!/usr/bin/env node

/**
 * マイグレーションスクリプト: participation_status フィールド追加
 *
 * t_tournament_teams テーブルに participation_status カラムを追加し、
 * 既存データを適切に移行します。
 */

import { createClient } from '@libsql/client';

// 開発版データベース設定（FALLBACK_CONFIG と同じ）
const db = createClient({
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
});

async function migrate() {
  console.log('🚀 マイグレーション開始: participation_status フィールド追加\n');

  try {
    // 1. カラムの存在チェック
    console.log('📋 Step 1: 既存カラムの確認...');
    const tableInfo = await db.execute(`PRAGMA table_info(t_tournament_teams)`);
    const hasParticipationStatus = tableInfo.rows.some(
      (row) => row.name === 'participation_status'
    );

    if (hasParticipationStatus) {
      console.log('✅ participation_status カラムは既に存在します');
      console.log('⏭️  マイグレーションをスキップします\n');
      return;
    }

    // 2. participation_status カラムを追加
    console.log('📝 Step 2: participation_status カラムを追加中...');
    await db.execute(`
      ALTER TABLE t_tournament_teams
      ADD COLUMN participation_status TEXT DEFAULT 'confirmed'
        CHECK(participation_status IN ('confirmed', 'waitlisted', 'cancelled'))
    `);
    console.log('✅ participation_status カラムを追加しました\n');

    // 3. 既存データの移行
    console.log('🔄 Step 3: 既存データの移行...');

    // 辞退承認済みのチームを 'cancelled' に設定
    const updateResult = await db.execute(`
      UPDATE t_tournament_teams
      SET participation_status = 'cancelled'
      WHERE withdrawal_status = 'withdrawal_approved'
    `);
    console.log(`   ✅ ${updateResult.rowsAffected} 件のチームを 'cancelled' に更新しました`);

    // 4. データ確認
    console.log('\n📊 Step 4: データ確認...');
    const stats = await db.execute(`
      SELECT
        participation_status,
        COUNT(*) as count
      FROM t_tournament_teams
      GROUP BY participation_status
    `);

    console.log('\n   参加ステータス別の集計:');
    stats.rows.forEach((row) => {
      console.log(`   - ${row.participation_status}: ${row.count} チーム`);
    });

    console.log('\n✅ マイグレーション完了！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    console.error('\n詳細:', error instanceof Error ? error.message : 'Unknown error');
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
