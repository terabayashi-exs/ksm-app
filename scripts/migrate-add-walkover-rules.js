#!/usr/bin/env node

/**
 * 不戦勝設定カラム追加マイグレーション
 * 
 * 目的: t_tournament_rulesテーブルに不戦勝時の得点設定カラムを追加
 * 追加カラム: walkover_settings (JSON形式)
 * 
 * JSON構造: {
 *   "winner_goals": 3,    // 不戦勝時勝者得点
 *   "loser_goals": 0      // 不戦勝時敗者得点
 * }
 */

import { createClient } from '@libsql/client';

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
 * テーブル構造確認
 */
async function checkTableStructure() {
  console.log('🔍 現在のテーブル構造を確認中...');
  
  try {
    // t_tournament_rulesテーブルの存在確認
    const tableCheck = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournament_rules'
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('t_tournament_rulesテーブルが存在しません');
    }
    
    // 現在のカラム構造確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournament_rules)");
    const columns = columnCheck.rows.map(row => ({
      name: row.name,
      type: row.type,
      notnull: row.notnull,
      dflt_value: row.dflt_value
    }));
    
    console.log('📋 現在のカラム構造:');
    columns.forEach(col => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    // walkover_settingsカラムの存在確認
    const hasWalkoverSettings = columns.some(col => col.name === 'walkover_settings');
    
    if (hasWalkoverSettings) {
      console.log('⚠️  walkover_settingsカラムが既に存在します');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ テーブル構造確認エラー:', error);
    throw error;
  }
}

/**
 * 不戦勝設定カラム追加
 */
async function addWalkoverSettingsColumn() {
  console.log('📋 walkover_settingsカラムを追加中...');
  
  try {
    await db.execute(`
      ALTER TABLE t_tournament_rules 
      ADD COLUMN walkover_settings TEXT
    `);
    
    console.log('✅ walkover_settingsカラム追加完了');
    
    // 追加されたカラムの確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournament_rules)");
    const walkoverColumn = columnCheck.rows.find(row => row.name === 'walkover_settings');
    
    if (walkoverColumn) {
      console.log(`✅ カラム確認: ${walkoverColumn.name} (${walkoverColumn.type})`);
    } else {
      throw new Error('カラム追加の確認に失敗しました');
    }
    
  } catch (error) {
    console.error('❌ カラム追加エラー:', error);
    throw error;
  }
}

/**
 * 既存大会にデフォルト不戦勝設定を追加
 */
async function addDefaultWalkoverSettings() {
  console.log('🎯 既存大会にデフォルト不戦勝設定を追加中...');
  
  try {
    // 現在の大会のt_tournamentsから不戦勝設定を取得
    const tournaments = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.walkover_winner_goals,
        t.walkover_loser_goals
      FROM t_tournaments t
    `);
    
    console.log(`📊 処理対象大会数: ${tournaments.rows.length}`);
    
    // 各大会の既存ルールに不戦勝設定を追加
    for (const tournament of tournaments.rows) {
      const walkoverSettings = JSON.stringify({
        winner_goals: tournament.walkover_winner_goals || 3,
        loser_goals: tournament.walkover_loser_goals || 0
      });
      
      // 既存のルールレコードを更新
      const updateResult = await db.execute(`
        UPDATE t_tournament_rules 
        SET walkover_settings = ?
        WHERE tournament_id = ?
      `, [walkoverSettings, tournament.tournament_id]);
      
      console.log(`  - 大会${tournament.tournament_id}(${tournament.tournament_name}): 勝者${tournament.walkover_winner_goals || 3}点-敗者${tournament.walkover_loser_goals || 0}点`);
    }
    
    // 設定されたルール数を確認
    const settingsCount = await db.execute(`
      SELECT COUNT(*) as count 
      FROM t_tournament_rules 
      WHERE walkover_settings IS NOT NULL
    `);
    
    console.log(`✅ 不戦勝設定完了: ${settingsCount.rows[0].count}件のルール`);
    
  } catch (error) {
    console.error('❌ デフォルト設定追加エラー:', error);
    throw error;
  }
}

/**
 * 追加後の検証
 */
async function validateMigration() {
  console.log('🔍 マイグレーション結果の検証中...');
  
  try {
    // カラム存在確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournament_rules)");
    const hasWalkoverSettings = columnCheck.rows.some(row => row.name === 'walkover_settings');
    
    if (!hasWalkoverSettings) {
      throw new Error('walkover_settingsカラムが見つかりません');
    }
    
    // データ確認
    const dataCheck = await db.execute(`
      SELECT 
        tr.tournament_id,
        tr.phase,
        tr.walkover_settings,
        t.tournament_name
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      WHERE tr.walkover_settings IS NOT NULL
      ORDER BY tr.tournament_id, tr.phase
      LIMIT 5
    `);
    
    console.log('📊 不戦勝設定サンプル:');
    dataCheck.rows.forEach(row => {
      try {
        const settings = JSON.parse(row.walkover_settings);
        console.log(`  - 大会${row.tournament_id}(${row.phase}): ${row.tournament_name} - 勝者${settings.winner_goals}点/敗者${settings.loser_goals}点`);
      } catch (e) {
        console.log(`  - 大会${row.tournament_id}(${row.phase}): ${row.tournament_name} - JSON解析エラー`);
      }
    });
    
    // 統計情報
    const stats = await db.execute(`
      SELECT 
        COUNT(*) as total_rules,
        COUNT(walkover_settings) as rules_with_walkover_settings
      FROM t_tournament_rules
    `);
    
    const statsData = stats.rows[0];
    console.log('📊 統計情報:');
    console.log(`  - 総ルール数: ${statsData.total_rules}`);
    console.log(`  - 不戦勝設定済みルール数: ${statsData.rules_with_walkover_settings}`);
    
    console.log('✅ マイグレーション検証完了');
    
  } catch (error) {
    console.error('❌ 検証エラー:', error);
    throw error;
  }
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🎯 不戦勝設定カラム追加マイグレーション開始');
  console.log('=========================================');
  
  try {
    // 1. テーブル構造確認
    const needsMigration = await checkTableStructure();
    if (!needsMigration) {
      console.log('✅ マイグレーション不要（walkover_settingsカラムが既に存在）');
      return;
    }
    
    // 2. カラム追加
    await addWalkoverSettingsColumn();
    
    // 3. デフォルト設定追加
    await addDefaultWalkoverSettings();
    
    // 4. 検証
    await validateMigration();
    
    // 完了メッセージ
    console.log('\n🎉 不戦勝設定カラム追加マイグレーション完了');
    console.log('=========================================');
    console.log('✅ walkover_settingsカラムが追加されました');
    console.log('✅ 既存大会にデフォルト設定が適用されました');
    console.log('✅ データ整合性が確認されました');
    console.log('');
    console.log('📝 次のステップ:');
    console.log('1. 大会ルール設定画面のUI拡張');
    console.log('2. 動的不戦勝設定読み込み機能の実装');
    console.log('3. 大会作成・編集フォームからの除去');
    
  } catch (error) {
    console.error('\n❌ マイグレーション失敗');
    console.error('=========================================');
    console.error('エラー詳細:', error.message);
    console.error('');
    console.error('対処方法:');
    console.error('1. データベース接続を確認');
    console.error('2. テーブル構造を確認');
    console.error('3. エラー内容を確認して修正');
    
    process.exit(1);
  }
}

// ESModuleの場合の実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };