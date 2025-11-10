#!/usr/bin/env node

/**
 * Blob移行スクリプト
 * 
 * Usage:
 *   npm run blob:migrate                    # 全アーカイブを移行
 *   npm run blob:migrate -- --selective    # 特定IDのみ移行
 *   npm run blob:migrate -- --dry-run      # ドライラン実行
 *   npm run blob:migrate -- --status       # 移行状況確認
 *   npm run blob:migrate -- --verify       # データ検証実行
 */

const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

// 環境変数を読み込み
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// カラーコード定義
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  title: (msg) => console.log(`${colors.bold}${colors.cyan}🚀 ${msg}${colors.reset}`),
  section: (msg) => console.log(`${colors.bold}${colors.magenta}📋 ${msg}${colors.reset}`)
};

// データベース接続
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * APIエンドポイント呼び出し
 */
async function callAPI(endpoint, method = 'GET', body = null) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const url = `${baseUrl}${endpoint}`;
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        // 管理者トークンをここに設定（実際の実装では適切な認証を使用）
        'Authorization': `Bearer admin-token`
      }
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      data: null 
    };
  }
}

/**
 * 移行状況確認
 */
async function checkMigrationStatus() {
  log.section('移行状況確認');

  const result = await callAPI('/api/admin/migration-status');
  
  if (!result.success) {
    log.error(`状況確認に失敗しました: ${result.error}`);
    return;
  }

  const { overview, categories, storage_analysis, recommendations } = result.data;

  console.log(`\\n📊 移行状況サマリー:`);
  console.log(`  データベースアーカイブ: ${overview.total_db_archives}件`);
  console.log(`  Blobアーカイブ: ${overview.total_blob_archives}件`);
  console.log(`  移行進捗: ${overview.migration_progress_percent}%`);
  console.log(`  データ整合性: ${overview.data_consistency_score}%`);

  console.log(`\\n📂 カテゴリ別状況:`);
  console.log(`  ✅ 移行済み: ${categories.migrated.length}件`);
  console.log(`  📤 未移行: ${categories.not_migrated.length}件`);
  console.log(`  📦 Blobのみ: ${categories.blob_only.length}件`);
  console.log(`  ⚠️ 不整合: ${categories.inconsistent.length}件`);

  console.log(`\\n💾 ストレージ分析:`);
  console.log(`  DBサイズ: ${storage_analysis.db_storage_mb}MB`);
  console.log(`  Blobサイズ: ${storage_analysis.blob_storage_mb}MB`);
  console.log(`  節約可能: ${storage_analysis.potential_savings_mb}MB`);

  if (recommendations.length > 0) {
    console.log(`\\n💡 推奨事項:`);
    recommendations.forEach(rec => {
      const icon = rec.type === 'action' ? '🔧' : rec.type === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} ${rec.title}: ${rec.description}`);
    });
  }

  return overview;
}

/**
 * 移行実行
 */
async function executeMigration(options = {}) {
  const { selective = false, tournamentIds = [], dryRun = false } = options;
  
  log.section(`移行実行${dryRun ? '（ドライラン）' : ''}`);

  const mode = selective ? 'selective' : 'all';
  const body = {
    mode,
    tournament_ids: tournamentIds,
    dry_run: dryRun
  };

  log.info(`実行モード: ${mode}`);
  if (selective) {
    log.info(`対象ID: [${tournamentIds.join(', ')}]`);
  }
  log.info(`ドライラン: ${dryRun ? 'Yes' : 'No'}`);

  console.log(`\\n⏳ 移行処理中...`);
  const startTime = Date.now();

  const result = await callAPI('/api/admin/migrate-to-blob', 'POST', body);
  
  if (!result.success) {
    log.error(`移行に失敗しました: ${result.error || result.data?.error}`);
    return;
  }

  const { summary, details } = result.data;
  const duration = Date.now() - startTime;

  console.log(`\\n📋 移行結果:`);
  console.log(`  ✅ 成功: ${summary.migrated_success}件`);
  console.log(`  ❌ 失敗: ${summary.migrated_failed}件`);
  console.log(`  ⏭️ スキップ: ${summary.already_migrated}件`);
  console.log(`  ⏱️ 実行時間: ${(summary.execution_time_ms / 1000).toFixed(2)}秒`);

  if (details.successful_migrations.length > 0) {
    console.log(`\\n✅ 成功した移行:`);
    details.successful_migrations.forEach(item => {
      console.log(`  📦 ${item.tournament_name} (${item.file_size_kb}KB, ${item.duration_ms}ms)`);
    });
  }

  if (details.failed_migrations.length > 0) {
    console.log(`\\n❌ 失敗した移行:`);
    details.failed_migrations.forEach(item => {
      console.log(`  💥 ${item.tournament_name}: ${item.error}`);
    });
  }

  if (details.skipped_migrations.length > 0) {
    console.log(`\\n⏭️ スキップした移行:`);
    details.skipped_migrations.forEach(item => {
      console.log(`  ⏭️ ${item.tournament_name}: ${item.reason}`);
    });
  }

  return summary;
}

/**
 * データ検証実行
 */
async function executeVerification(options = {}) {
  const { tournamentIds = [], deepCheck = true } = options;
  
  log.section('データ検証実行');

  const mode = tournamentIds.length > 0 ? 'selective' : 'all';
  const body = {
    tournament_ids: tournamentIds,
    check_type: mode,
    deep_check: deepCheck
  };

  log.info(`検証モード: ${mode}`);
  log.info(`詳細チェック: ${deepCheck ? 'Yes' : 'No'}`);
  if (mode === 'selective') {
    log.info(`対象ID: [${tournamentIds.join(', ')}]`);
  }

  console.log(`\\n🔍 検証処理中...`);

  const result = await callAPI('/api/admin/migration-verify', 'POST', body);
  
  if (!result.success) {
    log.error(`検証に失敗しました: ${result.error}`);
    return;
  }

  const { summary, results } = result.data;

  console.log(`\\n📋 検証結果サマリー:`);
  console.log(`  📊 検証総数: ${summary.total_checked}件`);
  console.log(`  ✅ 正常: ${summary.verified_count}件`);
  console.log(`  ❌ 失敗: ${summary.failed_count}件`);
  console.log(`  📊 DB不在: ${summary.missing_db_count}件`);
  console.log(`  📦 Blob不在: ${summary.missing_blob_count}件`);
  console.log(`  ⚠️ 重大問題: ${summary.critical_issues}件`);
  console.log(`  ⏱️ 実行時間: ${(summary.execution_time_ms / 1000).toFixed(2)}秒`);
  console.log(`  🎯 全体ステータス: ${summary.overall_status}`);

  // 問題のあるアーカイブの詳細表示
  const problemResults = results.filter(r => r.status !== 'verified');
  if (problemResults.length > 0) {
    console.log(`\\n⚠️ 問題のあるアーカイブ:`);
    problemResults.forEach(result => {
      const statusIcon = {
        'failed': '❌',
        'missing_db': '📊',
        'missing_blob': '📦'
      }[result.status] || '❓';
      
      console.log(`  ${statusIcon} ${result.tournament_name} (ID: ${result.tournament_id})`);
      console.log(`     ステータス: ${result.status}`);
      
      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`     推奨: ${result.recommendations[0]}`);
      }
      
      if (result.details.content_errors && result.details.content_errors.length > 0) {
        console.log(`     エラー: ${result.details.content_errors[0]}`);
      }
    });
  }

  return summary;
}

/**
 * 対話式メニュー
 */
async function interactiveMenu() {
  console.log('\\n📋 利用可能なオプション:');
  console.log('  1. 移行状況確認');
  console.log('  2. 全アーカイブ移行（ドライラン）');
  console.log('  3. 全アーカイブ移行（実行）');
  console.log('  4. データ検証実行');
  console.log('  5. 特定IDのみ移行');
  console.log('  0. 終了');

  // 簡易的な入力処理（実際の実装ではreadlineを使用）
  console.log('\\n💡 ヒント: コマンドライン引数で直接実行できます');
  console.log('  例: npm run blob:migrate -- --status');
  console.log('      npm run blob:migrate -- --dry-run');
  console.log('      npm run blob:migrate -- --verify');
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  
  log.title('Blob移行ツール');

  // 環境変数チェック
  if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
    log.error('必要な環境変数が設定されていません');
    console.log('  DATABASE_URL: ' + (process.env.DATABASE_URL ? '✅' : '❌'));
    console.log('  BLOB_READ_WRITE_TOKEN: ' + (process.env.BLOB_READ_WRITE_TOKEN ? '✅' : '❌'));
    process.exit(1);
  }

  try {
    if (args.includes('--status')) {
      await checkMigrationStatus();
    } else if (args.includes('--verify')) {
      await executeVerification();
    } else if (args.includes('--dry-run')) {
      await executeMigration({ dryRun: true });
    } else if (args.includes('--selective')) {
      // 簡易実装: 引数で直接IDを指定
      const ids = args.filter(arg => /^\\d+$/.test(arg)).map(Number);
      if (ids.length === 0) {
        log.warning('--selective使用時はTournament IDを指定してください');
        log.info('例: npm run blob:migrate -- --selective 1 2 3');
        return;
      }
      await executeMigration({ selective: true, tournamentIds: ids });
    } else if (args.includes('--help') || args.includes('-h')) {
      console.log('\\n📖 Blob移行ツール ヘルプ');
      console.log('\\n使用方法:');
      console.log('  npm run blob:migrate                    # 対話式メニュー');
      console.log('  npm run blob:migrate -- --status        # 移行状況確認');
      console.log('  npm run blob:migrate -- --dry-run       # ドライラン実行');
      console.log('  npm run blob:migrate -- --verify        # データ検証');
      console.log('  npm run blob:migrate -- --selective 1 2 # 特定ID移行');
      console.log('  npm run blob:migrate -- --help          # このヘルプ');
      console.log('\\n💡 各処理の詳細は実行時に表示されます');
    } else if (args.length === 0) {
      // 引数なしの場合は全移行実行
      log.warning('引数なしの場合は全アーカイブ移行を実行します');
      console.log('継続しますか? (Ctrl+C で中止)');
      
      // 5秒待機
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await executeMigration();
    } else {
      await interactiveMenu();
    }

    log.success('処理が完了しました');

  } catch (error) {
    log.error(`処理中にエラーが発生しました: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = {
  checkMigrationStatus,
  executeMigration,
  executeVerification
};