#!/usr/bin/env node

/**
 * 勝点フィールド削除マイグレーションのロールバックスクリプト
 * 
 * 目的: migrate-remove-point-fields.jsで削除した勝点フィールドを復元
 * 使用場面: マイグレーション後に問題が発見された場合の緊急復旧
 * 
 * 注意: このスクリプトは緊急時用です。
 * 通常は新しい勝点システム（t_tournament_rules）を使用してください。
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
 * バックアップファイルを検索
 */
function findBackupFiles() {
  const dataDir = path.join(process.cwd(), 'data');
  
  if (!fs.existsSync(dataDir)) {
    throw new Error('dataディレクトリが見つかりません');
  }
  
  const files = fs.readdirSync(dataDir);
  const backupFiles = files
    .filter(file => file.startsWith('backup-tournaments-') && file.endsWith('.json'))
    .sort()
    .reverse(); // 最新のファイルを先頭に
  
  if (backupFiles.length === 0) {
    throw new Error('バックアップファイルが見つかりません');
  }
  
  return backupFiles.map(file => ({
    filename: file,
    path: path.join(dataDir, file),
    timestamp: file.replace('backup-tournaments-', '').replace('.json', '')
  }));
}

/**
 * バックアップファイルの選択
 */
function selectBackupFile(backupFiles) {
  console.log('📂 利用可能なバックアップファイル:');
  backupFiles.forEach((backup, index) => {
    console.log(`  ${index + 1}. ${backup.filename} (${backup.timestamp})`);
  });
  
  // 最新のバックアップファイルを自動選択
  const selectedBackup = backupFiles[0];
  console.log(`\n🎯 最新のバックアップファイルを使用: ${selectedBackup.filename}`);
  
  return selectedBackup;
}

/**
 * バックアップデータの検証
 */
function validateBackupData(backupData) {
  if (!backupData.data || !Array.isArray(backupData.data)) {
    throw new Error('バックアップデータの形式が不正です');
  }
  
  if (backupData.data.length === 0) {
    throw new Error('バックアップデータが空です');
  }
  
  // 最初のレコードで勝点フィールドの存在を確認
  const firstRecord = backupData.data[0];
  const requiredFields = ['win_points', 'draw_points', 'loss_points'];
  const missingFields = requiredFields.filter(field => !(field in firstRecord));
  
  if (missingFields.length > 0) {
    throw new Error(`バックアップデータに必要なフィールドがありません: ${missingFields.join(', ')}`);
  }
  
  console.log(`✅ バックアップデータ検証完了: ${backupData.data.length}件のレコード`);
}

/**
 * 現在のテーブル構造確認
 */
async function checkCurrentTable() {
  try {
    const columnCheck = await db.execute("PRAGMA table_info(t_tournaments)");
    const columns = columnCheck.rows.map(row => row.name);
    
    const pointFields = ['win_points', 'draw_points', 'loss_points'];
    const existingPointFields = pointFields.filter(field => columns.includes(field));
    
    if (existingPointFields.length > 0) {
      console.log('⚠️  勝点フィールドが既に存在します:', existingPointFields.join(', '));
      console.log('ロールバックは不要かもしれません。');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ テーブル構造確認エラー:', error);
    throw error;
  }
}

/**
 * ロールバック実行
 */
async function executeRollback(backupData) {
  console.log('🔄 ロールバック実行中...');
  
  try {
    await db.execute('BEGIN TRANSACTION');
    
    // 1. 勝点フィールドを含む新しいテーブル構造を作成
    console.log('📋 勝点フィールドを含むテーブル構造を作成中...');
    await db.execute(`
      CREATE TABLE t_tournaments_rollback (
        tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_name TEXT NOT NULL,
        format_id INTEGER NOT NULL,
        venue_id INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        court_count INTEGER NOT NULL,
        tournament_dates TEXT,
        match_duration_minutes INTEGER NOT NULL,
        break_duration_minutes INTEGER NOT NULL,
        win_points INTEGER DEFAULT 3,
        draw_points INTEGER DEFAULT 1,
        loss_points INTEGER DEFAULT 0,
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
    
    // 2. バックアップデータを復元
    console.log('📤 バックアップデータを復元中...');
    for (const record of backupData.data) {
      const placeholders = Array(24).fill('?').join(', ');
      await db.execute(`
        INSERT INTO t_tournaments_rollback (
          tournament_id, tournament_name, format_id, venue_id, 
          team_count, court_count, tournament_dates, 
          match_duration_minutes, break_duration_minutes,
          win_points, draw_points, loss_points,
          walkover_winner_goals, walkover_loser_goals,
          status, visibility, public_start_date, 
          recruitment_start_date, recruitment_end_date,
          sport_type_id, created_by, archive_ui_version,
          is_archived, archived_at, archived_by,
          created_at, updated_at
        ) VALUES (${placeholders})
      `, [
        record.tournament_id, record.tournament_name, record.format_id, record.venue_id,
        record.team_count, record.court_count, record.tournament_dates,
        record.match_duration_minutes, record.break_duration_minutes,
        record.win_points || 3, record.draw_points || 1, record.loss_points || 0,
        record.walkover_winner_goals, record.walkover_loser_goals,
        record.status, record.visibility, record.public_start_date,
        record.recruitment_start_date, record.recruitment_end_date,
        record.sport_type_id, record.created_by, record.archive_ui_version,
        record.is_archived, record.archived_at, record.archived_by,
        record.created_at, record.updated_at
      ]);
    }
    
    // 3. データ検証
    const originalCount = backupData.data.length;
    const restoredCountResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments_rollback');
    const restoredCount = restoredCountResult.rows[0].count;
    
    if (originalCount !== restoredCount) {
      throw new Error(`データ復元エラー: 元データ${originalCount}件 vs 復元データ${restoredCount}件`);
    }
    
    console.log(`✅ データ復元完了: ${restoredCount}件`);
    
    // 4. テーブル置き換え
    console.log('🔄 テーブル置き換え中...');
    await db.execute('DROP TABLE t_tournaments');
    await db.execute('ALTER TABLE t_tournaments_rollback RENAME TO t_tournaments');
    
    await db.execute('COMMIT');
    console.log('✅ ロールバック完了');
    
  } catch (error) {
    console.error('❌ ロールバックエラー:', error);
    await db.execute('ROLLBACK');
    throw error;
  }
}

/**
 * ロールバック後の検証
 */
async function postRollbackValidation() {
  console.log('🔍 ロールバック後検証を実行中...');
  
  try {
    // 1. 勝点フィールドの存在確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournaments)");
    const columns = columnCheck.rows.map(row => row.name);
    
    const requiredFields = ['win_points', 'draw_points', 'loss_points'];
    const missingFields = requiredFields.filter(field => !columns.includes(field));
    
    if (missingFields.length > 0) {
      throw new Error(`勝点フィールドが復元されていません: ${missingFields.join(', ')}`);
    }
    
    console.log('✅ 勝点フィールドの復元を確認');
    
    // 2. データサンプル確認
    const sampleData = await db.execute(`
      SELECT tournament_id, tournament_name, win_points, draw_points, loss_points 
      FROM t_tournaments 
      ORDER BY tournament_id 
      LIMIT 3
    `);
    
    console.log('📋 復元データサンプル:');
    sampleData.rows.forEach(row => {
      console.log(`  - 大会${row.tournament_id}: ${row.tournament_name} (勝点: ${row.win_points}-${row.draw_points}-${row.loss_points})`);
    });
    
    console.log('✅ ロールバック後検証完了');
    
  } catch (error) {
    console.error('❌ ロールバック後検証エラー:', error);
    throw error;
  }
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🔄 勝点フィールド削除マイグレーションのロールバック開始');
  console.log('==============================================');
  
  try {
    // 1. 現在のテーブル構造確認
    const needsRollback = await checkCurrentTable();
    if (!needsRollback) {
      console.log('✅ ロールバック不要（勝点フィールドが既に存在）');
      return;
    }
    
    // 2. バックアップファイル検索・選択
    const backupFiles = findBackupFiles();
    const selectedBackup = selectBackupFile(backupFiles);
    
    // 3. バックアップデータ読み込み・検証
    console.log('📖 バックアップデータを読み込み中...');
    const backupContent = fs.readFileSync(selectedBackup.path, 'utf8');
    const backupData = JSON.parse(backupContent);
    validateBackupData(backupData);
    
    // 4. 警告表示
    console.log('\n⚠️  重要な警告:');
    console.log('このロールバックにより以下の影響があります:');
    console.log('- 現在のt_tournamentsテーブルのデータが失われます');
    console.log('- 新しい勝点システム(t_tournament_rules)との整合性が取れなくなる可能性があります');
    console.log('- マイグレーション後に行われた変更が失われます');
    console.log('');
    
    // 5. 本番環境確認
    if (DATABASE_URL.includes('prod') || DATABASE_URL.includes('production')) {
      console.log('🚨 本番環境が検出されました');
      console.log('本番環境でのロールバック実行には特別な注意が必要です');
      console.log('');
    }
    
    // 6. ロールバック実行
    await executeRollback(backupData);
    
    // 7. 検証
    await postRollbackValidation();
    
    // 8. 完了メッセージ
    console.log('\n🎉 ロールバック完了');
    console.log('==============================================');
    console.log('✅ 勝点フィールドが正常に復元されました');
    console.log('✅ データ整合性が確認されました');
    console.log('');
    console.log('⚠️  次のステップ:');
    console.log('1. 新しい勝点システム(t_tournament_rules)との整合性を確認');
    console.log('2. アプリケーションの動作確認');
    console.log('3. 必要に応じて、勝点システムの再設定');
    
  } catch (error) {
    console.error('\n❌ ロールバック失敗');
    console.error('==============================================');
    console.error('エラー詳細:', error.message);
    console.error('');
    console.error('対処方法:');
    console.error('1. バックアップファイルの整合性を確認');
    console.error('2. データベース接続を確認');
    console.error('3. エラー内容を確認して手動復旧を検討');
    
    process.exit(1);
  }
}

// ESModuleの場合の実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };