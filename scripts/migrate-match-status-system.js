// scripts/migrate-match-status-system.js
// 試合状態管理システムのためのデータベースマイグレーション

import { db } from '../lib/db.js';

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

    // 2. t_matches_liveテーブルの拡張
    console.log('📝 t_matches_live テーブルを拡張中...');
    
    // 新しいカラムを追加（存在しない場合のみ）
    const addColumns = [
      'ALTER TABLE t_matches_live ADD COLUMN match_status TEXT DEFAULT "scheduled" CHECK (match_status IN ("scheduled", "ongoing", "completed", "cancelled"))',
      'ALTER TABLE t_matches_live ADD COLUMN actual_start_time DATETIME',
      'ALTER TABLE t_matches_live ADD COLUMN actual_end_time DATETIME',
      'ALTER TABLE t_matches_live ADD COLUMN current_period INTEGER DEFAULT 1'
    ];

    for (const sql of addColumns) {
      try {
        await db.execute(sql);
        console.log(`✅ カラム追加成功: ${sql.split('ADD COLUMN')[1]?.split(' ')[0]}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⏭️  カラム既存のためスキップ: ${sql.split('ADD COLUMN')[1]?.split(' ')[0]}`);
        } else {
          throw error;
        }
      }
    }

    // 3. t_matches_liveのスコアフィールドをTEXT型に変更
    console.log('🔄 スコアフィールドをTEXT型に変更中...');
    
    // SQLiteでは直接型変更できないため、バックアップテーブルを作成
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_matches_live_backup AS 
      SELECT * FROM t_matches_live
    `);

    // 新しい構造でテーブル再作成
    await db.execute(`DROP TABLE IF EXISTS t_matches_live_new`);
    await db.execute(`
      CREATE TABLE t_matches_live_new (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_scores TEXT NOT NULL DEFAULT '0',
        team2_scores TEXT NOT NULL DEFAULT '0',
        period_count INTEGER NOT NULL DEFAULT 1,
        current_period INTEGER DEFAULT 1,
        winner_team_id TEXT,
        match_status TEXT DEFAULT 'scheduled' CHECK (match_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
        actual_start_time DATETIME,
        actual_end_time DATETIME,
        remarks TEXT,
        confirmed_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      )
    `);

    // データ移行
    await db.execute(`
      INSERT INTO t_matches_live_new (
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, period_count,
        current_period, winner_team_id, match_status, actual_start_time, 
        actual_end_time, remarks, confirmed_by, created_at, updated_at
      )
      SELECT 
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, 
        CAST(team1_scores AS TEXT), CAST(team2_scores AS TEXT), period_count,
        COALESCE(current_period, 1), winner_team_id, 
        COALESCE(match_status, 'scheduled'), actual_start_time, 
        actual_end_time, remarks, confirmed_by, created_at, updated_at
      FROM t_matches_live
    `);

    // テーブル入れ替え
    await db.execute(`DROP TABLE t_matches_live`);
    await db.execute(`ALTER TABLE t_matches_live_new RENAME TO t_matches_live`);

    // 4. t_matches_finalテーブルも同様に更新
    console.log('📊 t_matches_final テーブルを更新中...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_matches_final_new (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_scores TEXT NOT NULL DEFAULT '0',
        team2_scores TEXT NOT NULL DEFAULT '0',
        period_count INTEGER NOT NULL DEFAULT 1,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        remarks TEXT,
        confirmed_by TEXT,
        confirmed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      )
    `);

    // データ移行（既存データがある場合）
    const finalExists = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='t_matches_final'`);
    if (finalExists.rows.length > 0) {
      await db.execute(`
        INSERT INTO t_matches_final_new (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, period_count,
          winner_team_id, is_draw, is_walkover, remarks, confirmed_by, 
          confirmed_at, created_at
        )
        SELECT 
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, 
          CAST(COALESCE(team1_goals, 0) AS TEXT), 
          CAST(COALESCE(team2_goals, 0) AS TEXT), 
          1, -- デフォルトのperiod_count
          winner_team_id, is_draw, is_walkover, remarks, confirmed_by, 
          confirmed_at, created_at
        FROM t_matches_final
      `);

      await db.execute(`DROP TABLE t_matches_final`);
    }
    
    await db.execute(`ALTER TABLE t_matches_final_new RENAME TO t_matches_final`);

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
      await db.execute(indexSql);
    }

    console.log('✅ マイグレーション完了！');
    console.log('📊 作成されたテーブル:');
    console.log('  - t_match_status (試合状態管理)');
    console.log('  - t_matches_live (ピリオド対応スコア)');
    console.log('  - t_matches_final (統一スキーマ)');

    // 確認クエリ
    const statusCount = await db.execute(`SELECT COUNT(*) as count FROM t_match_status`);
    const liveCount = await db.execute(`SELECT COUNT(*) as count FROM t_matches_live`);
    
    console.log(`\n📈 データ確認:`);
    console.log(`  - 試合状態レコード数: ${statusCount.rows[0].count}`);
    console.log(`  - ライブ試合数: ${liveCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateMatchStatusSystem().catch(console.error);
}

export { migrateMatchStatusSystem };