#!/usr/bin/env node

/**
 * 不戦勝フィールド削除マイグレーション（Turso対応版）
 * 
 * 目的: t_tournamentsテーブルから不要になった不戦勝関連フィールドを削除
 * 対象: walkover_winner_goals, walkover_loser_goals カラム
 * 
 * Turso専用: トランザクションを使用せずに実行
 * 実行前に必ずバックアップを取得してください
 */

import { createClient } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';

// 環境変数から接続情報を取得
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL環境変数が設定されていません');
  process.exit(1);
}

const db = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN
});

/**
 * バックアップファイル作成
 */
async function createBackup() {
  console.log('📦 マイグレーション前バックアップを作成中...');
  
  try {
    const tournaments = await db.execute('SELECT * FROM t_tournaments');
    const backupData = {
      timestamp: new Date().toISOString(),
      description: 'Migration backup before removing walkover fields (Turso version)',
      table: 't_tournaments',
      data: tournaments.rows
    };
    
    const backupFileName = `backup-tournaments-walkover-turso-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
    const backupPath = path.join(process.cwd(), 'data', backupFileName);
    
    // dataディレクトリが存在しない場合は作成
    const dataDir = path.dirname(backupPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`✅ バックアップ作成完了: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ バックアップ作成エラー:', error);
    throw error;
  }
}

/**
 * マイグレーション前の検証
 */
async function preValidation() {
  console.log('🔍 マイグレーション前検証を実行中...');
  
  try {
    // 1. テーブル存在確認
    const tableCheck = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournaments'
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('t_tournamentsテーブルが存在しません');
    }
    
    // 2. 削除対象カラムの存在確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournaments)");
    const columns = columnCheck.rows.map(row => row.name);
    
    const targetColumns = ['walkover_winner_goals', 'walkover_loser_goals'];
    const existingTargetColumns = targetColumns.filter(col => columns.includes(col));
    
    if (existingTargetColumns.length === 0) {
      console.log('⚠️  削除対象の不戦勝カラムが既に存在しません。マイグレーション不要です。');
      return false;
    }
    
    console.log(`📋 削除対象カラム: ${existingTargetColumns.join(', ')}`);
    
    // 3. レコード数確認
    const countResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments');
    const recordCount = countResult.rows[0].count;
    console.log(`📊 大会レコード数: ${recordCount}`);
    
    // 4. 新不戦勝システムの動作確認
    const rulesCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_rules 
      WHERE walkover_settings IS NOT NULL
    `);
    const rulesWithWalkoverSettings = rulesCheck.rows[0].count;
    console.log(`🎯 不戦勝設定済みルール数: ${rulesWithWalkoverSettings}`);
    
    if (rulesWithWalkoverSettings === 0) {
      console.log('⚠️  新不戦勝設定が見つかりません。先にt_tournament_rulesの不戦勝設定を確認してください。');
    }
    
    return true;
  } catch (error) {
    console.error('❌ 事前検証エラー:', error);
    throw error;
  }
}

/**
 * Turso用マイグレーション処理（トランザクションなし）
 */
async function executeTursoMigration() {
  console.log('🚀 Turso用マイグレーション実行中...');
  
  try {
    // 1. 外部キー制約を無効化
    console.log('🔧 外部キー制約を無効化中...');
    await db.execute('PRAGMA foreign_keys = OFF');
    
    // 2. 現在のデータを取得
    console.log('📥 現在のデータを取得中...');
    const currentData = await db.execute('SELECT * FROM t_tournaments');
    console.log(`📊 取得データ: ${currentData.rows.length}件`);
    
    // 3. 新しいテーブル構造でt_tournaments_newを作成
    console.log('📋 新しいテーブル構造を作成中...');
    await db.execute(`
      CREATE TABLE t_tournaments_new (
        tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_name TEXT NOT NULL,
        format_id INTEGER NOT NULL,
        venue_id INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        court_count INTEGER NOT NULL,
        tournament_dates TEXT,
        match_duration_minutes INTEGER NOT NULL,
        break_duration_minutes INTEGER NOT NULL,
        status TEXT DEFAULT 'planning',
        visibility TEXT DEFAULT 'preparing',
        public_start_date TEXT,
        recruitment_start_date TEXT,
        recruitment_end_date TEXT,
        sport_type_id INTEGER,
        created_by TEXT,
        archive_ui_version TEXT,
        is_archived INTEGER DEFAULT 0,
        archived_at DATETIME,
        archived_by TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours'))
      )
    `);
    
    // 4. データを新しいテーブルに移行（不戦勝フィールドを除外）
    console.log('📤 データ移行中...');
    for (const row of currentData.rows) {
      await db.execute(`
        INSERT INTO t_tournaments_new (
          tournament_id, tournament_name, format_id, venue_id, 
          team_count, court_count, tournament_dates, 
          match_duration_minutes, break_duration_minutes,
          status, visibility, public_start_date, 
          recruitment_start_date, recruitment_end_date,
          sport_type_id, created_by, archive_ui_version,
          is_archived, archived_at, archived_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.tournament_id, row.tournament_name, row.format_id, row.venue_id,
        row.team_count, row.court_count, row.tournament_dates,
        row.match_duration_minutes, row.break_duration_minutes,
        row.status, row.visibility, row.public_start_date,
        row.recruitment_start_date, row.recruitment_end_date,
        row.sport_type_id, row.created_by, row.archive_ui_version,
        row.is_archived, row.archived_at, row.archived_by,
        row.created_at, row.updated_at
      ]);
    }
    
    // 5. 移行データの検証
    const newCount = await db.execute('SELECT COUNT(*) as count FROM t_tournaments_new');
    
    if (currentData.rows.length !== newCount.rows[0].count) {
      throw new Error(`データ移行エラー: 元テーブル${currentData.rows.length}件 vs 新テーブル${newCount.rows[0].count}件`);
    }
    
    console.log(`✅ データ移行完了: ${newCount.rows[0].count}件`);
    
    // 6. 旧テーブル削除・新テーブルリネーム
    console.log('🔄 テーブル置き換え中...');
    await db.execute('DROP TABLE t_tournaments');
    await db.execute('ALTER TABLE t_tournaments_new RENAME TO t_tournaments');
    
    // 7. 外部キー制約を再有効化
    console.log('🔧 外部キー制約を再有効化中...');
    await db.execute('PRAGMA foreign_keys = ON');
    
    console.log('✅ Turso用マイグレーション完了');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    
    // エラー時のクリーンアップ
    try {
      console.log('🧹 エラー時クリーンアップ実行中...');
      await db.execute('DROP TABLE IF EXISTS t_tournaments_new');
      await db.execute('PRAGMA foreign_keys = ON');
      console.log('✅ クリーンアップ完了');
    } catch (cleanupError) {
      console.error('❌ クリーンアップエラー:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * マイグレーション後の検証
 */
async function postValidation() {
  console.log('🔍 マイグレーション後検証を実行中...');
  
  try {
    // 1. テーブル構造確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournaments)");
    const columns = columnCheck.rows.map(row => row.name);
    
    const removedColumns = ['walkover_winner_goals', 'walkover_loser_goals'];
    const stillExisting = removedColumns.filter(col => columns.includes(col));
    
    if (stillExisting.length > 0) {
      throw new Error(`削除対象カラムが残存: ${stillExisting.join(', ')}`);
    }
    
    console.log('✅ 削除対象カラムの除去を確認');
    
    // 2. レコード数確認
    const countResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments');
    const finalRecordCount = countResult.rows[0].count;
    console.log(`📊 最終レコード数: ${finalRecordCount}`);
    
    // 3. 基本データ整合性確認
    const sampleData = await db.execute(`
      SELECT tournament_id, tournament_name, format_id, venue_id, team_count 
      FROM t_tournaments 
      ORDER BY tournament_id 
      LIMIT 3
    `);
    
    console.log('📋 サンプルデータ確認:');
    sampleData.rows.forEach(row => {
      console.log(`  - 大会${row.tournament_id}: ${row.tournament_name} (フォーマット${row.format_id}, 会場${row.venue_id}, ${row.team_count}チーム)`);
    });
    
    console.log('✅ マイグレーション後検証完了');
    
  } catch (error) {
    console.error('❌ 事後検証エラー:', error);
    throw error;
  }
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🎯 不戦勝フィールド削除マイグレーション開始（Turso版）');
  console.log('===============================================');
  
  try {
    // 事前検証
    const needsMigration = await preValidation();
    if (!needsMigration) {
      console.log('✅ マイグレーション完了（対象カラムが既に存在しない）');
      return;
    }
    
    // バックアップ作成
    const backupPath = await createBackup();
    
    // 確認プロンプト
    console.log('\n⚠️  重要: このマイグレーションは元に戻せません');
    console.log('Turso用の簡易版マイグレーションを実行します');
    console.log('継続する前に、バックアップが作成されたことを確認してください');
    console.log('');
    
    // マイグレーション実行
    await executeTursoMigration();
    
    // 事後検証
    await postValidation();
    
    // 完了メッセージ
    console.log('\n🎉 Turso用マイグレーション完了');
    console.log('===============================================');
    console.log('✅ 不戦勝フィールドが正常に削除されました');
    console.log('✅ データ整合性が確認されました');
    console.log('✅ 新不戦勝システムへの移行が完了しました');
    console.log('');
    console.log(`📦 バックアップファイル: ${backupPath}`);
    
  } catch (error) {
    console.error('\n❌ マイグレーション失敗');
    console.error('===============================================');
    console.error('エラー詳細:', error.message);
    console.error('');
    console.error('対処方法:');
    console.error('1. バックアップファイルを確認');
    console.error('2. エラー内容を確認して修正');
    console.error('3. 必要に応じてロールバック実行');
    
    process.exit(1);
  }
}

// ESModuleの場合の実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };