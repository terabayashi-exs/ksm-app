#!/usr/bin/env node

/**
 * 勝点システム移行の検証スクリプト
 * 
 * 目的: 勝点システムの新旧システム間の整合性を検証
 * 実行タイミング: マイグレーション前後の状況確認
 * 
 * 検証項目:
 * 1. 旧システム（t_tournaments）の勝点フィールド存在確認
 * 2. 新システム（t_tournament_rules）の勝点設定確認
 * 3. 動的勝点読み込み機能の動作確認
 * 4. データ整合性チェック
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
 * 旧勝点システム（t_tournaments）の状況確認
 */
async function checkLegacyPointSystem() {
  console.log('🔍 旧勝点システム（t_tournaments）の確認...');
  
  try {
    // テーブル構造確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournaments)");
    const columns = columnCheck.rows.map(row => row.name);
    
    const pointFields = ['win_points', 'draw_points', 'loss_points'];
    const existingPointFields = pointFields.filter(field => columns.includes(field));
    const missingPointFields = pointFields.filter(field => !columns.includes(field));
    
    console.log('📋 テーブル構造:');
    if (existingPointFields.length > 0) {
      console.log(`  ✅ 存在する勝点フィールド: ${existingPointFields.join(', ')}`);
      
      // データサンプル確認
      const sampleQuery = `
        SELECT tournament_id, tournament_name, ${existingPointFields.join(', ')}
        FROM t_tournaments 
        ORDER BY tournament_id 
        LIMIT 5
      `;
      const sampleData = await db.execute(sampleQuery);
      
      console.log('📊 勝点データサンプル:');
      sampleData.rows.forEach(row => {
        const pointValues = existingPointFields.map(field => `${field}:${row[field]}`).join(', ');
        console.log(`    大会${row.tournament_id}: ${row.tournament_name} (${pointValues})`);
      });
    }
    
    if (missingPointFields.length > 0) {
      console.log(`  ❌ 存在しない勝点フィールド: ${missingPointFields.join(', ')}`);
    }
    
    return {
      hasLegacyFields: existingPointFields.length > 0,
      existingFields: existingPointFields,
      missingFields: missingPointFields
    };
    
  } catch (error) {
    console.error('❌ 旧勝点システム確認エラー:', error);
    throw error;
  }
}

/**
 * 新勝点システム（t_tournament_rules）の状況確認
 */
async function checkNewPointSystem() {
  console.log('\n🔍 新勝点システム（t_tournament_rules）の確認...');
  
  try {
    // テーブル存在確認
    const tableCheck = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournament_rules'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('❌ t_tournament_rulesテーブルが存在しません');
      return { hasNewSystem: false };
    }
    
    // point_systemカラム存在確認
    const columnCheck = await db.execute("PRAGMA table_info(t_tournament_rules)");
    const columns = columnCheck.rows.map(row => row.name);
    
    if (!columns.includes('point_system')) {
      console.log('❌ point_systemカラムが存在しません');
      return { hasNewSystem: false };
    }
    
    // 勝点設定データ確認
    const pointSystemData = await db.execute(`
      SELECT 
        tr.tournament_id,
        tr.phase,
        tr.point_system,
        t.tournament_name
      FROM t_tournament_rules tr
      JOIN t_tournaments t ON tr.tournament_id = t.tournament_id
      WHERE tr.point_system IS NOT NULL
      ORDER BY tr.tournament_id, tr.phase
      LIMIT 10
    `);
    
    console.log('📋 新勝点システム状況:');
    console.log(`  ✅ t_tournament_rulesテーブル: 存在`);
    console.log(`  ✅ point_systemカラム: 存在`);
    console.log(`  📊 勝点設定済み大会数: ${pointSystemData.rows.length}`);
    
    if (pointSystemData.rows.length > 0) {
      console.log('📊 勝点設定サンプル:');
      pointSystemData.rows.forEach(row => {
        try {
          const pointSystem = JSON.parse(row.point_system);
          console.log(`    大会${row.tournament_id}(${row.phase}): ${row.tournament_name} - 勝点(${pointSystem.win}-${pointSystem.draw}-${pointSystem.loss})`);
        } catch (e) {
          console.log(`    大会${row.tournament_id}(${row.phase}): ${row.tournament_name} - 勝点設定エラー`);
        }
      });
    }
    
    // 全大会の勝点設定状況
    const tournamentCounts = await db.execute(`
      SELECT 
        COUNT(DISTINCT t.tournament_id) as total_tournaments,
        COUNT(DISTINCT tr.tournament_id) as tournaments_with_rules,
        COUNT(DISTINCT CASE WHEN tr.point_system IS NOT NULL THEN tr.tournament_id END) as tournaments_with_point_system
      FROM t_tournaments t
      LEFT JOIN t_tournament_rules tr ON t.tournament_id = tr.tournament_id
    `);
    
    const counts = tournamentCounts.rows[0];
    console.log('📊 勝点設定カバレッジ:');
    console.log(`    総大会数: ${counts.total_tournaments}`);
    console.log(`    ルール設定済み大会数: ${counts.tournaments_with_rules}`);
    console.log(`    勝点設定済み大会数: ${counts.tournaments_with_point_system}`);
    
    return {
      hasNewSystem: true,
      pointSystemCount: pointSystemData.rows.length,
      totalTournaments: counts.total_tournaments,
      tournamentsWithPointSystem: counts.tournaments_with_point_system
    };
    
  } catch (error) {
    console.error('❌ 新勝点システム確認エラー:', error);
    throw error;
  }
}

/**
 * 動的勝点読み込み機能の動作確認
 */
async function checkDynamicPointLoading() {
  console.log('\n🔍 動的勝点読み込み機能の確認...');
  
  try {
    // サンプル大会を取得
    const tournaments = await db.execute(`
      SELECT tournament_id, tournament_name 
      FROM t_tournaments 
      ORDER BY tournament_id 
      LIMIT 3
    `);
    
    if (tournaments.rows.length === 0) {
      console.log('⚠️  テスト用の大会データが見つかりません');
      return;
    }
    
    for (const tournament of tournaments.rows) {
      const tournamentId = tournament.tournament_id;
      
      // 新システムから勝点を取得
      const newSystemResult = await db.execute(`
        SELECT point_system 
        FROM t_tournament_rules 
        WHERE tournament_id = ? AND point_system IS NOT NULL
        LIMIT 1
      `, [tournamentId]);
      
      let newSystemPoints = null;
      if (newSystemResult.rows.length > 0) {
        try {
          newSystemPoints = JSON.parse(newSystemResult.rows[0].point_system);
        } catch (e) {
          console.log(`    ❌ 大会${tournamentId}: 勝点JSON解析エラー`);
          continue;
        }
      }
      
      // 旧システムから勝点を取得（フィールドが存在する場合）
      let legacySystemPoints = null;
      try {
        const legacySystemResult = await db.execute(`
          SELECT win_points, draw_points, loss_points 
          FROM t_tournaments 
          WHERE tournament_id = ?
        `, [tournamentId]);
        
        if (legacySystemResult.rows.length > 0) {
          const row = legacySystemResult.rows[0];
          legacySystemPoints = {
            win: row.win_points,
            draw: row.draw_points,
            loss: row.loss_points
          };
        }
      } catch (e) {
        // 旧システムフィールドが存在しない場合はスキップ
      }
      
      // 結果表示
      console.log(`📊 大会${tournamentId}: ${tournament.tournament_name}`);
      
      if (newSystemPoints) {
        console.log(`    ✅ 新システム: 勝点(${newSystemPoints.win}-${newSystemPoints.draw}-${newSystemPoints.loss})`);
      } else {
        console.log(`    ❌ 新システム: 勝点設定なし`);
      }
      
      if (legacySystemPoints) {
        console.log(`    📋 旧システム: 勝点(${legacySystemPoints.win}-${legacySystemPoints.draw}-${legacySystemPoints.loss})`);
        
        // 新旧システムの比較
        if (newSystemPoints) {
          const isConsistent = 
            newSystemPoints.win === legacySystemPoints.win &&
            newSystemPoints.draw === legacySystemPoints.draw &&
            newSystemPoints.loss === legacySystemPoints.loss;
          
          if (isConsistent) {
            console.log(`    ✅ 新旧システムの勝点設定が一致`);
          } else {
            console.log(`    ⚠️  新旧システムの勝点設定が不一致`);
          }
        }
      } else {
        console.log(`    📋 旧システム: 勝点フィールドなし`);
      }
    }
    
  } catch (error) {
    console.error('❌ 動的勝点読み込み確認エラー:', error);
    throw error;
  }
}

/**
 * 移行状況の総合評価
 */
function evaluateMigrationStatus(legacyStatus, newStatus) {
  console.log('\n📋 移行状況の総合評価');
  console.log('====================');
  
  if (!legacyStatus.hasLegacyFields && newStatus.hasNewSystem) {
    console.log('✅ 移行完了: 旧勝点フィールドが削除され、新システムが稼働中');
    console.log('🎯 推奨アクション: なし（移行完了）');
    return 'completed';
  }
  
  if (legacyStatus.hasLegacyFields && newStatus.hasNewSystem) {
    console.log('⚠️  移行進行中: 新旧両システムが存在');
    console.log('🎯 推奨アクション: 旧勝点フィールド削除マイグレーション実行');
    return 'in_progress';
  }
  
  if (legacyStatus.hasLegacyFields && !newStatus.hasNewSystem) {
    console.log('❌ 移行未開始: 旧システムのみ存在');
    console.log('🎯 推奨アクション: 新勝点システム（t_tournament_rules）の設定');
    return 'not_started';
  }
  
  if (!legacyStatus.hasLegacyFields && !newStatus.hasNewSystem) {
    console.log('❌ システム不整合: 新旧両システムが存在しない');
    console.log('🎯 推奨アクション: 勝点システムの再構築');
    return 'inconsistent';
  }
  
  return 'unknown';
}

/**
 * 推奨次ステップの表示
 */
function showNextSteps(migrationStatus, legacyStatus, newStatus) {
  console.log('\n📝 推奨次ステップ');
  console.log('================');
  
  switch (migrationStatus) {
    case 'completed':
      console.log('✅ 移行が完了しています。追加のアクションは不要です。');
      console.log('');
      console.log('定期チェック項目:');
      console.log('- 新勝点システムの動作確認');
      console.log('- 順位計算ロジックの検証');
      break;
      
    case 'in_progress':
      console.log('🔧 移行を完了するために以下を実行してください:');
      console.log('');
      console.log('1. 旧勝点フィールド削除マイグレーション実行:');
      console.log('   node scripts/migrate-remove-point-fields.js');
      console.log('');
      console.log('2. マイグレーション後の検証:');
      console.log('   node scripts/validate-point-system-migration.js');
      break;
      
    case 'not_started':
      console.log('🚀 移行を開始するために以下を実行してください:');
      console.log('');
      console.log('1. 新勝点システムの設定:');
      console.log('   - t_tournament_rulesテーブルにpoint_systemカラムを追加');
      console.log('   - 各大会に勝点設定を移行');
      console.log('');
      console.log('2. 動的勝点読み込み機能の実装確認');
      console.log('3. 新システム動作確認後、旧フィールド削除');
      break;
      
    case 'inconsistent':
      console.log('🚨 システム不整合が検出されました:');
      console.log('');
      console.log('緊急対応:');
      console.log('1. データベースバックアップの取得');
      console.log('2. 勝点システムの再構築');
      console.log('3. 整合性の再確認');
      break;
      
    default:
      console.log('❓ 不明な移行状況です。詳細な調査が必要です。');
  }
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🎯 勝点システム移行検証開始');
  console.log('==========================');
  
  try {
    // 1. 旧システム確認
    const legacyStatus = await checkLegacyPointSystem();
    
    // 2. 新システム確認
    const newStatus = await checkNewPointSystem();
    
    // 3. 動的読み込み機能確認
    await checkDynamicPointLoading();
    
    // 4. 移行状況評価
    const migrationStatus = evaluateMigrationStatus(legacyStatus, newStatus);
    
    // 5. 推奨次ステップ表示
    showNextSteps(migrationStatus, legacyStatus, newStatus);
    
    console.log('\n🎉 検証完了');
    console.log('==========================');
    
  } catch (error) {
    console.error('\n❌ 検証失敗');
    console.error('==========================');
    console.error('エラー詳細:', error.message);
    process.exit(1);
  }
}

// ESModuleの場合の実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };