// scripts/migrate-tournaments-to-groups.js
// グループ化されていない大会に自動的に大会グループを作成するスクリプト

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// コマンドライン引数の確認
const isDryRun = process.argv.includes('--dry-run');

async function migrateTournamentsToGroups() {
  try {
    console.log('🚀 大会グループ自動作成スクリプトを開始します...');
    console.log(`モード: ${isDryRun ? '🔍 DRY RUN (プレビューのみ)' : '✅ 本番実行'}\n`);

    // 1. グループ化されていない大会を取得
    const ungroupedTournamentsResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      WHERE t.group_id IS NULL
      ORDER BY t.tournament_id
    `);

    const ungroupedTournaments = ungroupedTournamentsResult.rows;

    if (ungroupedTournaments.length === 0) {
      console.log('✅ グループ化が必要な大会はありません。');
      return;
    }

    console.log(`📊 処理対象: ${ungroupedTournaments.length}件の大会\n`);

    // 2. 各大会に対して処理
    let successCount = 0;
    let errorCount = 0;
    const migrationLog = [];

    for (const tournament of ungroupedTournaments) {
      try {
        console.log(`\n--- 処理中: ${tournament.tournament_name} (ID: ${tournament.tournament_id}) ---`);

        // 大会グループ情報を準備
        const groupName = tournament.tournament_name;  // 同名の大会グループ
        const organizer = '運営事務局';  // デフォルト主催者（後で手動修正可能）
        const venueId = tournament.venue_id || 1;  // 会場（未設定の場合はID:1をデフォルト）

        // 開催日程の取得
        let eventStartDate = null;
        let eventEndDate = null;

        if (tournament.tournament_dates) {
          try {
            const dates = JSON.parse(tournament.tournament_dates);
            if (dates && dates.length > 0) {
              // 最初の日と最後の日を取得
              eventStartDate = dates[0].date;
              eventEndDate = dates[dates.length - 1].date;
            }
          } catch (e) {
            console.log(`   ⚠️  日程データの解析に失敗: ${e.message}`);
          }
        }

        // デフォルト日程（未設定の場合）
        if (!eventStartDate) {
          const today = new Date();
          eventStartDate = today.toISOString().split('T')[0];
          eventEndDate = eventStartDate;
          console.log(`   ℹ️  デフォルト日程を設定: ${eventStartDate}`);
        }

        // 募集期間
        const recruitmentStartDate = tournament.recruitment_start_date || eventStartDate;
        const recruitmentEndDate = tournament.recruitment_end_date || eventStartDate;

        // 公開設定
        const visibility = tournament.visibility || 'open';

        console.log(`   📝 大会グループ情報:`);
        console.log(`      - グループ名: ${groupName}`);
        console.log(`      - 主催者: ${organizer}`);
        console.log(`      - 会場ID: ${venueId}`);
        console.log(`      - 開催期間: ${eventStartDate} 〜 ${eventEndDate}`);
        console.log(`      - 募集期間: ${recruitmentStartDate} 〜 ${recruitmentEndDate}`);
        console.log(`      - 公開設定: ${visibility}`);

        if (!isDryRun) {
          // 大会グループを作成
          const insertGroupResult = await db.execute(`
            INSERT INTO t_tournament_groups (
              group_name,
              organizer,
              venue_id,
              event_start_date,
              event_end_date,
              recruitment_start_date,
              recruitment_end_date,
              visibility,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
          `, [
            groupName,
            organizer,
            venueId,
            eventStartDate,
            eventEndDate,
            recruitmentStartDate,
            recruitmentEndDate,
            visibility
          ]);

          const newGroupId = Number(insertGroupResult.lastInsertRowid);
          console.log(`   ✅ 大会グループ作成成功 (グループID: ${newGroupId})`);

          // 大会を作成したグループに紐付け
          await db.execute(`
            UPDATE t_tournaments
            SET group_id = ?,
                updated_at = datetime('now', '+9 hours')
            WHERE tournament_id = ?
          `, [newGroupId, tournament.tournament_id]);

          console.log(`   ✅ 大会をグループに紐付け完了`);

          migrationLog.push({
            tournamentId: tournament.tournament_id,
            tournamentName: tournament.tournament_name,
            groupId: newGroupId,
            groupName: groupName,
            status: 'success'
          });

          successCount++;
        } else {
          console.log(`   🔍 DRY RUN: 実際の作成はスキップされました`);
          migrationLog.push({
            tournamentId: tournament.tournament_id,
            tournamentName: tournament.tournament_name,
            groupName: groupName,
            status: 'dry-run'
          });
          successCount++;
        }

      } catch (error) {
        console.error(`   ❌ エラー: ${error.message}`);
        migrationLog.push({
          tournamentId: tournament.tournament_id,
          tournamentName: tournament.tournament_name,
          status: 'error',
          error: error.message
        });
        errorCount++;
      }
    }

    // 3. 結果サマリー
    console.log('\n\n=== マイグレーション結果 ===');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);

    if (migrationLog.length > 0) {
      console.log('\n=== 処理ログ ===');
      migrationLog.forEach(log => {
        if (log.status === 'success') {
          console.log(`✅ [${log.tournamentId}] ${log.tournamentName} → グループID: ${log.groupId}`);
        } else if (log.status === 'dry-run') {
          console.log(`🔍 [${log.tournamentId}] ${log.tournamentName} → グループ名: ${log.groupName}`);
        } else {
          console.log(`❌ [${log.tournamentId}] ${log.tournamentName} → エラー: ${log.error}`);
        }
      });
    }

    if (isDryRun) {
      console.log('\n📝 これはプレビューです。実際の変更は行われていません。');
      console.log('   本番実行する場合: node scripts/migrate-tournaments-to-groups.js');
    } else {
      console.log('\n✅ マイグレーション完了！');
      console.log('\n📝 次のステップ:');
      console.log('   1. データベースを確認: node scripts/analyze-tournament-groups.js');
      console.log('   2. 管理画面で大会グループを確認');
      console.log('   3. 必要に応じて主催者情報などを手動で修正');
    }

  } catch (error) {
    console.error('❌ 致命的なエラーが発生しました:', error);
    process.exit(1);
  }
}

migrateTournamentsToGroups();
