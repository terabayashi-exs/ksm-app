// scripts/analyze-tournament-groups.js
// 既存の大会とグループの状況を分析するスクリプト

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function analyzeTournamentGroups() {
  try {
    console.log('🔍 大会グループ化状況の分析を開始します...\n');

    // 1. 全大会数の取得
    const totalTournamentsResult = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournaments
    `);
    const totalTournaments = Number(totalTournamentsResult.rows[0].count);
    console.log(`📊 総大会数: ${totalTournaments}件`);

    // 2. グループ化されている大会の取得
    const groupedTournamentsResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM t_tournaments
      WHERE group_id IS NOT NULL
    `);
    const groupedTournaments = Number(groupedTournamentsResult.rows[0].count);
    console.log(`✅ グループ化済み: ${groupedTournaments}件`);

    // 3. グループ化されていない大会の取得
    const ungroupedTournamentsResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM t_tournaments
      WHERE group_id IS NULL
    `);
    const ungroupedTournaments = Number(ungroupedTournamentsResult.rows[0].count);
    console.log(`❌ 未グループ化: ${ungroupedTournaments}件\n`);

    // 4. 既存グループの詳細
    const existingGroupsResult = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        COUNT(t.tournament_id) as division_count
      FROM t_tournament_groups tg
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      GROUP BY tg.group_id
      ORDER BY tg.group_id
    `);

    if (existingGroupsResult.rows.length > 0) {
      console.log('=== 既存の大会グループ ===');
      existingGroupsResult.rows.forEach(group => {
        console.log(`📁 グループID: ${group.group_id}`);
        console.log(`   名前: ${group.group_name}`);
        console.log(`   主催者: ${group.organizer || '未設定'}`);
        console.log(`   会場ID: ${group.venue_id || '未設定'}`);
        console.log(`   所属部門数: ${group.division_count}件\n`);
      });
    } else {
      console.log('=== 既存の大会グループ ===');
      console.log('（グループは存在しません）\n');
    }

    // 5. グループ化されていない大会の詳細
    if (ungroupedTournaments > 0) {
      const ungroupedDetailsResult = await db.execute(`
        SELECT
          t.tournament_id,
          t.tournament_name,
          t.venue_id,
          v.venue_name,
          t.team_count,
          t.status,
          t.created_at
        FROM t_tournaments t
        LEFT JOIN m_venues v ON t.venue_id = v.venue_id
        WHERE t.group_id IS NULL
        ORDER BY t.tournament_id
      `);

      console.log('=== グループ化が必要な大会 ===');
      ungroupedDetailsResult.rows.forEach(tournament => {
        console.log(`🏆 大会ID: ${tournament.tournament_id}`);
        console.log(`   名前: ${tournament.tournament_name}`);
        console.log(`   会場: ${tournament.venue_name || '未設定'}`);
        console.log(`   チーム数: ${tournament.team_count}チーム`);
        console.log(`   ステータス: ${tournament.status}`);
        console.log(`   作成日: ${tournament.created_at}\n`);
      });
    }

    // 6. マイグレーション対象のサマリー
    console.log('=== マイグレーションサマリー ===');
    console.log(`✨ 新規作成される大会グループ: ${ungroupedTournaments}件`);
    console.log(`📋 処理対象の大会: ${ungroupedTournaments}件`);
    console.log(`🔄 既存グループへの影響: なし\n`);

    // 7. データ整合性チェック
    console.log('=== データ整合性チェック ===');

    // 会場情報の確認
    const tournamentsWithoutVenueResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM t_tournaments
      WHERE venue_id IS NULL AND group_id IS NULL
    `);
    const tournamentsWithoutVenue = Number(tournamentsWithoutVenueResult.rows[0].count);

    if (tournamentsWithoutVenue > 0) {
      console.log(`⚠️  会場未設定の大会: ${tournamentsWithoutVenue}件（デフォルト会場を設定します）`);
    } else {
      console.log(`✅ 会場情報: すべての大会に設定済み`);
    }

    // 日程情報の確認
    const tournamentsWithoutDatesResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM t_tournaments
      WHERE tournament_dates IS NULL AND group_id IS NULL
    `);
    const tournamentsWithoutDates = Number(tournamentsWithoutDatesResult.rows[0].count);

    if (tournamentsWithoutDates > 0) {
      console.log(`⚠️  日程未設定の大会: ${tournamentsWithoutDates}件（デフォルト日程を設定します）`);
    } else {
      console.log(`✅ 日程情報: すべての大会に設定済み`);
    }

    console.log('\n✅ 分析完了！\n');
    console.log('📝 次のステップ:');
    console.log('   1. node scripts/migrate-tournaments-to-groups.js --dry-run (プレビュー)');
    console.log('   2. node scripts/migrate-tournaments-to-groups.js (実行)');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

analyzeTournamentGroups();
