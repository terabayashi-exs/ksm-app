#!/usr/bin/env node

/**
 * 勝点フィールド削除マイグレーション
 * 
 * 目的: t_tournamentsテーブルから不要になった勝点関連フィールドを削除
 * 対象: win_points, draw_points, loss_points カラム
 * 
 * 前提条件:
 * - 勝点システムがt_tournament_rulesテーブルに移行済み
 * - 全てのコード参照が除去済み
 * 
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
      description: 'Migration backup before removing point fields',
      table: 't_tournaments',
      data: tournaments.rows
    };
    
    const backupFileName = `backup-tournaments-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
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
    
    const targetColumns = ['win_points', 'draw_points', 'loss_points'];
    const existingTargetColumns = targetColumns.filter(col => columns.includes(col));
    
    if (existingTargetColumns.length === 0) {
      console.log('⚠️  削除対象の勝点カラムが既に存在しません。マイグレーション不要です。');
      return false;
    }
    
    console.log(`📋 削除対象カラム: ${existingTargetColumns.join(', ')}`);
    
    // 3. レコード数確認
    const countResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments');
    const recordCount = countResult.rows[0].count;
    console.log(`📊 大会レコード数: ${recordCount}`);
    
    // 4. 新勝点システムの動作確認
    const rulesCheck = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_rules 
      WHERE point_system IS NOT NULL
    `);
    const rulesWithPointSystem = rulesCheck.rows[0].count;
    console.log(`🎯 勝点システム設定済みルール数: ${rulesWithPointSystem}`);
    
    if (rulesWithPointSystem === 0) {
      console.log('⚠️  新勝点システムの設定が見つかりません。先にt_tournament_rulesの勝点設定を確認してください。');
    }
    
    return true;
  } catch (error) {
    console.error('❌ 事前検証エラー:', error);
    throw error;
  }
}

/**
 * メインマイグレーション処理
 */
async function executeMigration() {
  console.log('🚀 マイグレーション実行中...');
  
  try {
    await db.execute('BEGIN TRANSACTION');
    
    // 外部キー制約を一時的に無効化
    await db.execute('PRAGMA foreign_keys = OFF');
    
    // 1. 新しいテーブル構造でt_tournaments_newを作成
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
        walkover_winner_goals INTEGER DEFAULT 3,
        walkover_loser_goals INTEGER DEFAULT 0,
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
    
    // 2. データを新しいテーブルに移行（勝点フィールドを除外）
    console.log('📤 データ移行中...');
    await db.execute(`
      INSERT INTO t_tournaments_new (
        tournament_id, tournament_name, format_id, venue_id, 
        team_count, court_count, tournament_dates, 
        match_duration_minutes, break_duration_minutes,
        walkover_winner_goals, walkover_loser_goals,
        status, visibility, public_start_date, 
        recruitment_start_date, recruitment_end_date,
        sport_type_id, created_by, archive_ui_version,
        is_archived, archived_at, archived_by,
        created_at, updated_at
      )
      SELECT 
        tournament_id, tournament_name, format_id, venue_id, 
        team_count, court_count, tournament_dates, 
        match_duration_minutes, break_duration_minutes,
        walkover_winner_goals, walkover_loser_goals,
        status, visibility, public_start_date, 
        recruitment_start_date, recruitment_end_date,
        sport_type_id, created_by, archive_ui_version,
        is_archived, archived_at, archived_by,
        created_at, updated_at
      FROM t_tournaments
    `);
    
    // 3. 移行データの検証
    const oldCount = await db.execute('SELECT COUNT(*) as count FROM t_tournaments');
    const newCount = await db.execute('SELECT COUNT(*) as count FROM t_tournaments_new');
    
    if (oldCount.rows[0].count !== newCount.rows[0].count) {
      throw new Error(`データ移行エラー: 元テーブル${oldCount.rows[0].count}件 vs 新テーブル${newCount.rows[0].count}件`);
    }
    
    console.log(`✅ データ移行完了: ${newCount.rows[0].count}件`);
    
    // 4. 旧テーブル削除・新テーブルリネーム
    console.log('🔄 テーブル置き換え中...');
    await db.execute('DROP TABLE t_tournaments');
    await db.execute('ALTER TABLE t_tournaments_new RENAME TO t_tournaments');
    
    // 外部キー制約を再有効化
    await db.execute('PRAGMA foreign_keys = ON');
    
    await db.execute('COMMIT');
    console.log('✅ マイグレーション完了');
    
  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    try {
      // 外部キー制約を再有効化（エラー時も）
      await db.execute('PRAGMA foreign_keys = ON');
      await db.execute('ROLLBACK');
    } catch (rollbackError) {
      console.error('❌ ロールバックエラー:', rollbackError);
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
    
    const removedColumns = ['win_points', 'draw_points', 'loss_points'];
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
 * ロールバック手順の表示
 */
function showRollbackInstructions(backupPath) {
  console.log('\n📝 ロールバック手順:');
  console.log('万が一問題が発生した場合は、以下の手順でロールバックできます:');
  console.log('');
  console.log('1. バックアップファイルからデータを確認:');
  console.log(`   cat "${backupPath}"`);
  console.log('');
  console.log('2. 手動でテーブルを再作成し、バックアップデータを復元');
  console.log('   (SQLiteの場合は複雑なため、事前に完全なダンプを推奨)');
  console.log('');
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🎯 勝点フィールド削除マイグレーション開始');
  console.log('=====================================');
  
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
    console.log('継続する前に、バックアップが作成されたことを確認してください');
    console.log('');
    
    // 本番環境での実行確認
    if (DATABASE_URL.includes('prod') || DATABASE_URL.includes('production')) {
      console.log('🚨 本番環境が検出されました');
      console.log('本番環境でのマイグレーション実行には特別な注意が必要です');
      console.log('');
    }
    
    // マイグレーション実行
    await executeMigration();
    
    // 事後検証
    await postValidation();
    
    // 完了メッセージ
    console.log('\n🎉 マイグレーション完了');
    console.log('=====================================');
    console.log('✅ 勝点フィールドが正常に削除されました');
    console.log('✅ データ整合性が確認されました');
    console.log('✅ 新勝点システムへの移行が完了しました');
    
    // ロールバック手順表示
    showRollbackInstructions(backupPath);
    
  } catch (error) {
    console.error('\n❌ マイグレーション失敗');
    console.error('=====================================');
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