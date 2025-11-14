// scripts/rollback-tournament-groups.js
// マイグレーションをロールバックするスクリプト
// 注意: このスクリプトは、マイグレーションで自動作成された大会グループのみを削除します

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// コマンドライン引数の確認
const isDryRun = process.argv.includes('--dry-run');
const forceMode = process.argv.includes('--force');

async function rollbackTournamentGroups() {
  try {
    console.log('🔄 大会グループマイグレーションのロールバックを開始します...');
    console.log(`モード: ${isDryRun ? '🔍 DRY RUN (プレビューのみ)' : '⚠️  本番実行'}\n`);

    if (!isDryRun && !forceMode) {
      console.error('❌ 安全のため、本番実行には --force フラグが必要です。');
      console.log('\n使用方法:');
      console.log('  プレビュー: node scripts/rollback-tournament-groups.js --dry-run');
      console.log('  実行: node scripts/rollback-tournament-groups.js --force');
      process.exit(1);
    }

    // 1. 自動作成されたグループの特定
    // 自動作成されたグループは、所属する大会が1つだけで、グループ名と大会名が一致する
    const autoCreatedGroupsResult = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        COUNT(t.tournament_id) as division_count,
        GROUP_CONCAT(t.tournament_id) as tournament_ids,
        GROUP_CONCAT(t.tournament_name) as tournament_names
      FROM t_tournament_groups tg
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      GROUP BY tg.group_id
      HAVING division_count = 1 AND tg.group_name = MAX(t.tournament_name)
      ORDER BY tg.group_id
    `);

    const autoCreatedGroups = autoCreatedGroupsResult.rows;

    if (autoCreatedGroups.length === 0) {
      console.log('✅ ロールバック対象のグループはありません。');
      console.log('   （自動作成されたグループが見つかりませんでした）');
      return;
    }

    console.log(`📊 ロールバック対象: ${autoCreatedGroups.length}件の大会グループ\n`);

    // 2. 対象グループの詳細表示
    console.log('=== ロールバック対象の大会グループ ===');
    autoCreatedGroups.forEach(group => {
      console.log(`📁 グループID: ${group.group_id}`);
      console.log(`   名前: ${group.group_name}`);
      console.log(`   主催者: ${group.organizer || '未設定'}`);
      console.log(`   所属部門: ${group.tournament_names}`);
      console.log(`   部門ID: ${group.tournament_ids}\n`);
    });

    if (isDryRun) {
      console.log('🔍 DRY RUN: 実際の削除はスキップされました');
      console.log('\n本番実行する場合:');
      console.log('  node scripts/rollback-tournament-groups.js --force');
      return;
    }

    // 3. ロールバック実行の確認
    console.log('⚠️  警告: この操作は元に戻せません！');
    console.log(`   ${autoCreatedGroups.length}件の大会グループが削除され、`);
    console.log(`   所属する大会はグループから外れます。\n`);

    // 4. ロールバック処理
    let successCount = 0;
    let errorCount = 0;

    for (const group of autoCreatedGroups) {
      try {
        console.log(`処理中: グループID ${group.group_id} (${group.group_name})`);

        // 所属する大会のgroup_idをNULLに設定
        await db.execute(`
          UPDATE t_tournaments
          SET group_id = NULL,
              updated_at = datetime('now', '+9 hours')
          WHERE group_id = ?
        `, [group.group_id]);

        console.log(`  ✅ 大会のグループ紐付けを解除`);

        // 大会グループを削除
        await db.execute(`
          DELETE FROM t_tournament_groups
          WHERE group_id = ?
        `, [group.group_id]);

        console.log(`  ✅ グループを削除\n`);
        successCount++;

      } catch (error) {
        console.error(`  ❌ エラー: ${error.message}\n`);
        errorCount++;
      }
    }

    // 5. 結果サマリー
    console.log('\n=== ロールバック結果 ===');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);

    if (successCount > 0) {
      console.log('\n✅ ロールバック完了！');
      console.log('\n📝 確認:');
      console.log('   node scripts/analyze-tournament-groups.js');
    }

  } catch (error) {
    console.error('❌ 致命的なエラーが発生しました:', error);
    process.exit(1);
  }
}

rollbackTournamentGroups();
