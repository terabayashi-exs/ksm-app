// scripts/check-tournament-9-archive.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');
const fs = require('fs');

async function checkTournament9Archive() {
  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    console.log('=== 大会ID:9 アーカイブ詳細調査 ===\n');

    // 1. t_tournamentsテーブルの状態確認
    console.log('1. t_tournaments テーブルの状態:');
    const tournamentResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        is_archived,
        archive_ui_version,
        updated_at
      FROM t_tournaments 
      WHERE tournament_id = 9
    `);
    
    if (tournamentResult.rows.length > 0) {
      const tournament = tournamentResult.rows[0];
      console.log(`   - 大会名: ${tournament.tournament_name}`);
      console.log(`   - ステータス: ${tournament.status}`);
      console.log(`   - is_archived: ${tournament.is_archived}`);
      console.log(`   - archive_ui_version: ${tournament.archive_ui_version}`);
      console.log(`   - 更新日時: ${tournament.updated_at}`);
    }

    // 2. アーカイブJSONデータの詳細確認
    console.log('\n2. アーカイブJSONデータの詳細:');
    const archiveResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        archive_version,
        archived_at,
        archived_by,
        tournament_data,
        teams_data,
        matches_data,
        standings_data,
        results_data,
        pdf_info_data,
        metadata
      FROM t_archived_tournament_json 
      WHERE tournament_id = 9
      ORDER BY archived_at DESC
      LIMIT 1
    `);

    if (archiveResult.rows.length === 0) {
      console.log('   アーカイブデータが見つかりません');
      return;
    }

    const archive = archiveResult.rows[0];
    console.log(`   - tournament_id: ${archive.tournament_id}`);
    console.log(`   - tournament_name: ${archive.tournament_name}`);
    console.log(`   - archive_version: ${archive.archive_version}`);
    console.log(`   - archived_at: ${archive.archived_at}`);
    console.log(`   - archived_by: ${archive.archived_by}`);

    // 3. 各JSONデータの内容確認
    console.log('\n3. JSONデータの内容:');
    
    // tournament_data
    try {
      const tournamentData = JSON.parse(archive.tournament_data);
      console.log('\n   [tournament_data]:');
      console.log(`     - 大会名: ${tournamentData.tournament_name}`);
      console.log(`     - 会場: ${tournamentData.venue_name}`);
      console.log(`     - 開催期間: ${tournamentData.tournament_dates}`);
      console.log(`     - チーム数: ${tournamentData.team_count}`);
      console.log(`     - フォーマット: ${tournamentData.format_name}`);
    } catch (e) {
      console.log('   tournament_data パースエラー:', e.message);
    }

    // teams_data
    try {
      const teamsData = JSON.parse(archive.teams_data);
      console.log('\n   [teams_data]:');
      console.log(`     - 総チーム数: ${teamsData.length}`);
      
      // ブロック別チーム数を集計
      const blockCounts = {};
      teamsData.forEach(team => {
        if (team.assigned_block) {
          blockCounts[team.assigned_block] = (blockCounts[team.assigned_block] || 0) + 1;
        }
      });
      console.log('     - ブロック別チーム数:');
      Object.entries(blockCounts).sort().forEach(([block, count]) => {
        console.log(`       ${block}ブロック: ${count}チーム`);
      });

      // 総選手数を計算
      const totalPlayers = teamsData.reduce((sum, team) => sum + (team.players?.length || 0), 0);
      console.log(`     - 総選手数: ${totalPlayers}人`);
    } catch (e) {
      console.log('   teams_data パースエラー:', e.message);
    }

    // matches_data
    try {
      const matchesData = JSON.parse(archive.matches_data);
      console.log('\n   [matches_data]:');
      console.log(`     - 総試合数: ${matchesData.length}`);
      
      const confirmedCount = matchesData.filter(m => m.is_confirmed).length;
      console.log(`     - 確定済み試合数: ${confirmedCount}`);
      
      // フェーズ別試合数
      const phaseCounts = {};
      matchesData.forEach(match => {
        phaseCounts[match.phase] = (phaseCounts[match.phase] || 0) + 1;
      });
      console.log('     - フェーズ別試合数:');
      Object.entries(phaseCounts).forEach(([phase, count]) => {
        console.log(`       ${phase}: ${count}試合`);
      });
    } catch (e) {
      console.log('   matches_data パースエラー:', e.message);
    }

    // standings_data
    try {
      const standingsData = JSON.parse(archive.standings_data);
      console.log('\n   [standings_data]:');
      console.log(`     - 順位表ブロック数: ${standingsData.length}`);
      standingsData.forEach(block => {
        console.log(`       ${block.block_name}: ${block.teams?.length || 0}チーム`);
      });
    } catch (e) {
      console.log('   standings_data パースエラー:', e.message);
    }

    // 4. results_dataとpdf_info_dataの確認
    console.log('\n4. その他のデータ確認:');
    
    // results_data
    if (archive.results_data) {
      try {
        const resultsData = JSON.parse(archive.results_data);
        console.log('\n   [results_data]:');
        console.log(`     - 結果データ数: ${resultsData.length || Object.keys(resultsData).length}`);
      } catch (e) {
        console.log('   results_data パースエラー:', e.message);
      }
    }
    
    // pdf_info_data
    if (archive.pdf_info_data) {
      try {
        const pdfInfo = JSON.parse(archive.pdf_info_data);
        console.log('\n   [pdf_info_data]:');
        console.log(`     - PDFコンテンツ: ${JSON.stringify(pdfInfo)}`);
      } catch (e) {
        console.log('   pdf_info_data パースエラー:', e.message);
      }
    }
    
    // metadata
    if (archive.metadata) {
      try {
        const metadata = JSON.parse(archive.metadata);
        console.log('\n   [metadata]:');
        console.log(`     - メタデータ: ${JSON.stringify(metadata, null, 2)}`);
      } catch (e) {
        console.log('   metadata パースエラー:', e.message);
      }
    }

    // 5. データ整合性の確認
    console.log('\n5. データ整合性チェック:');
    
    // 元のデータと比較
    const originalTeams = await db.execute(`
      SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = 9
    `);
    
    const originalMatches = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);
    
    const originalConfirmed = await db.execute(`
      SELECT COUNT(*) as count FROM t_matches_final mf
      JOIN t_matches_live ml ON mf.match_id = ml.match_id
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 9
    `);

    console.log('   元データとの比較:');
    console.log(`     - t_tournament_teams: ${originalTeams.rows[0].count} チーム`);
    console.log(`     - t_matches_live: ${originalMatches.rows[0].count} 試合`);
    console.log(`     - t_matches_final: ${originalConfirmed.rows[0].count} 確定試合`);

    // 6. アーカイブ状態の診断
    console.log('\n6. アーカイブ状態の診断:');
    const tournament = tournamentResult.rows[0];
    if (tournament.is_archived === 1) {
      console.log('   ✅ 大会は正常にアーカイブ済みです');
      console.log(`   ✅ アーカイブUIバージョン: ${tournament.archive_ui_version || 'v1'}`);
      console.log(`   ✅ アーカイブバージョン: ${archive.archive_version}`);
      console.log(`   ✅ アクセスURL: /public/tournaments/9/archived`);
    } else {
      console.log('   ⚠️  大会のis_archivedフラグが0です');
      console.log('   ⚠️  アーカイブは作成されていますが、フラグが更新されていません');
    }

  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await db.close();
  }
}

checkTournament9Archive().catch(console.error);