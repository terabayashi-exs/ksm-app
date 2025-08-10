// scripts/migrate-match-status-system.ts
// 試合状態管理システムのためのデータベースマイグレーション

import { db } from '../lib/db';

async function migrateMatchStatusSystem() {
  console.log('🚀 試合状態管理システム マイグレーション開始...');

  try {
    // 1. 試合状態管理テーブルの作成
    console.log('📊 t_match_status テーブルを作成中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_match_status (
        match_id INTEGER PRIMARY KEY,
        match_block_id INTEGER NOT NULL,
        match_status TEXT NOT NULL DEFAULT 'scheduled' 
          CHECK (match_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
        actual_start_time DATETIME,
        actual_end_time DATETIME,
        current_period INTEGER DEFAULT 1,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id)
      )
    `);

    // 2. t_matches_liveテーブルに新しいカラムを追加
    console.log('📝 t_matches_live テーブルを拡張中...');
    
    const addColumns = [
      { sql: 'ALTER TABLE t_matches_live ADD COLUMN match_status TEXT DEFAULT "scheduled"', name: 'match_status' },
      { sql: 'ALTER TABLE t_matches_live ADD COLUMN actual_start_time DATETIME', name: 'actual_start_time' },
      { sql: 'ALTER TABLE t_matches_live ADD COLUMN actual_end_time DATETIME', name: 'actual_end_time' },
      { sql: 'ALTER TABLE t_matches_live ADD COLUMN current_period INTEGER DEFAULT 1', name: 'current_period' }
    ];

    for (const { sql, name } of addColumns) {
      try {
        await db.execute(sql);
        console.log(`✅ カラム追加成功: ${name}`);
      } catch (error: any) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⏭️  カラム既存のためスキップ: ${name}`);
        } else {
          throw error;
        }
      }
    }

    // 3. スコアフィールドをTEXT型に変更する前に、バックアップを作成
    console.log('🔄 スコアフィールドのバックアップと変換中...');
    
    // バックアップテーブルを作成（存在しない場合のみ）
    try {
      await db.execute(`
        CREATE TABLE t_matches_live_backup AS 
        SELECT * FROM t_matches_live LIMIT 0
      `);
      console.log('📋 バックアップテーブル作成完了');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️  バックアップ作成エラー（続行）:', error.message);
      }
    }

    // 4. スコアフィールドがINTEGER型の場合、TEXT型に変更する処理
    // SQLiteは直接型変更ができないので、必要に応じて後で対応

    // 5. 既存試合データの状態テーブルへの初期化
    console.log('🔄 既存試合データの状態を初期化中...');
    await db.execute(`
      INSERT OR IGNORE INTO t_match_status (match_id, match_block_id, match_status, updated_at)
      SELECT match_id, match_block_id, 'scheduled', CURRENT_TIMESTAMP
      FROM t_matches_live
    `);

    // 6. インデックス作成
    console.log('📇 インデックスを作成中...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_match_status_block ON t_match_status(match_block_id)',
      'CREATE INDEX IF NOT EXISTS idx_match_status_status ON t_match_status(match_status)',
      'CREATE INDEX IF NOT EXISTS idx_matches_live_status ON t_matches_live(match_status)',
      'CREATE INDEX IF NOT EXISTS idx_matches_live_period ON t_matches_live(current_period)'
    ];

    for (const indexSql of indexes) {
      try {
        await db.execute(indexSql);
      } catch (error: any) {
        console.log(`⚠️  インデックス作成スキップ: ${error.message}`);
      }
    }

    console.log('✅ マイグレーション完了！');
    console.log('📊 作成されたテーブル:');
    console.log('  - t_match_status (試合状態管理)');
    console.log('  - t_matches_live (拡張済み)');

    // 確認クエリ
    try {
      const statusCount = await db.execute(`SELECT COUNT(*) as count FROM t_match_status`);
      const liveCount = await db.execute(`SELECT COUNT(*) as count FROM t_matches_live`);
      
      console.log(`\n📈 データ確認:`);
      console.log(`  - 試合状態レコード数: ${statusCount.rows[0].count}`);
      console.log(`  - ライブ試合数: ${liveCount.rows[0].count}`);
    } catch (error) {
      console.log('⚠️  確認クエリをスキップ');
    }

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// 実行部分
if (require.main === module) {
  migrateMatchStatusSystem().catch(console.error);
}

export { migrateMatchStatusSystem };