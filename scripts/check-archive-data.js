// scripts/check-archive-data.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

async function checkArchiveData() {
  const db = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    console.log('🔍 アーカイブデータの詳細チェックを開始...\n');

    // 1. アーカイブテーブルの存在確認
    console.log('📋 テーブル構造の確認:');
    try {
      const tableInfo = await db.execute('PRAGMA table_info(t_archived_tournament_json)');
      console.log('✅ t_archived_tournament_json テーブルが存在します');
      console.log('   列構成:');
      tableInfo.rows.forEach(column => {
        console.log(`   - ${column.name}: ${column.type} ${column.notnull ? 'NOT NULL' : 'NULL'} ${column.dflt_value ? `DEFAULT ${column.dflt_value}` : ''}`);
      });
    } catch (error) {
      console.log('❌ t_archived_tournament_json テーブルが存在しません');
      console.log('   テーブルを作成するには: node scripts/create-json-archive-table.js');
      return;
    }

    // 2. アーカイブ一覧の確認
    console.log('\n📊 アーカイブデータの一覧:');
    const archivesResult = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        archived_at,
        archived_by,
        archive_version,
        last_accessed,
        metadata
      FROM t_archived_tournament_json
      ORDER BY archived_at DESC
    `);

    if (archivesResult.rows.length === 0) {
      console.log('   アーカイブデータが見つかりません。');
      
      // アーカイブ可能な大会を表示
      const completedResult = await db.execute(`
        SELECT tournament_id, tournament_name, status
        FROM t_tournaments 
        WHERE status = 'completed' AND is_archived != 1
        LIMIT 5
      `);
      
      if (completedResult.rows.length > 0) {
        console.log('\n💡 アーカイブ可能な完了大会:');
        completedResult.rows.forEach((tournament, index) => {
          console.log(`   ${index + 1}. ${tournament.tournament_name} (ID: ${tournament.tournament_id})`);
        });
        console.log('\n   管理画面から「アーカイブ」ボタンでアーカイブを作成できます。');
      }
      
      return;
    }

    console.log(`✅ ${archivesResult.rows.length}件のアーカイブが見つかりました:`);

    // 3. 各アーカイブの詳細チェック
    for (let i = 0; i < archivesResult.rows.length; i++) {
      const archive = archivesResult.rows[i];
      console.log(`\n${i + 1}. ${archive.tournament_name} (ID: ${archive.tournament_id})`);
      console.log(`   アーカイブ日時: ${archive.archived_at}`);
      console.log(`   作成者: ${archive.archived_by}`);
      console.log(`   バージョン: ${archive.archive_version || 'v1_json'}`);
      console.log(`   最終アクセス: ${archive.last_accessed || '未アクセス'}`);
      
      // メタデータの解析
      if (archive.metadata) {
        try {
          const metadata = JSON.parse(archive.metadata);
          console.log(`   データ概要:`);
          console.log(`     - 参加チーム数: ${metadata.total_teams || 'N/A'}`);
          console.log(`     - 総試合数: ${metadata.total_matches || 'N/A'}`);
          console.log(`     - 確定試合数: ${metadata.completed_matches || 'N/A'}`);
          console.log(`     - ブロック数: ${metadata.blocks_count || 'N/A'}`);
        } catch (error) {
          console.log(`   ⚠️ メタデータの解析に失敗: ${error.message}`);
        }
      }

      // データ完整性チェック
      console.log(`   データ完整性チェック:`);
      try {
        const dataResult = await db.execute(`
          SELECT 
            tournament_data,
            teams_data,
            matches_data,
            standings_data,
            results_data,
            pdf_info_data
          FROM t_archived_tournament_json
          WHERE tournament_id = ?
        `, [archive.tournament_id]);

        if (dataResult.rows.length === 0) {
          console.log(`     ❌ データが見つかりません`);
          continue;
        }

        const data = dataResult.rows[0];
        
        // JSONの妥当性チェック
        const checks = [
          { name: 'tournament_data', data: data.tournament_data },
          { name: 'teams_data', data: data.teams_data },
          { name: 'matches_data', data: data.matches_data },
          { name: 'standings_data', data: data.standings_data },
          { name: 'results_data', data: data.results_data },
          { name: 'pdf_info_data', data: data.pdf_info_data }
        ];

        for (const check of checks) {
          if (!check.data) {
            console.log(`     ⚠️ ${check.name}: データが空です`);
            continue;
          }

          try {
            const parsed = JSON.parse(check.data);
            const size = (check.data.length / 1024).toFixed(2);
            console.log(`     ✅ ${check.name}: ${size} KB (正常)`);
            
            // 配列データの場合、件数を表示
            if (Array.isArray(parsed)) {
              console.log(`        - 項目数: ${parsed.length}`);
            }
          } catch (error) {
            console.log(`     ❌ ${check.name}: JSON解析エラー`);
          }
        }

        // アクセスURLの生成
        console.log(`   アクセスURL:`);
        console.log(`     /public/tournaments/${archive.tournament_id}/archived`);

      } catch (error) {
        console.log(`     ❌ データチェックエラー: ${error.message}`);
      }
    }

    // 4. 総合統計
    console.log('\n📈 アーカイブ統計:');
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) as total_archives,
        MIN(archived_at) as oldest_archive,
        MAX(archived_at) as newest_archive,
        COUNT(CASE WHEN last_accessed IS NOT NULL THEN 1 END) as accessed_count
      FROM t_archived_tournament_json
    `);

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log(`   総アーカイブ数: ${stats.total_archives}`);
      console.log(`   最古のアーカイブ: ${stats.oldest_archive}`);
      console.log(`   最新のアーカイブ: ${stats.newest_archive}`);
      console.log(`   アクセス済み: ${stats.accessed_count} / ${stats.total_archives}`);
    }

    // 5. ディスク使用量
    console.log('\n💾 ディスク使用量分析:');
    const sizeResult = await db.execute(`
      SELECT 
        SUM(length(tournament_data) + length(teams_data) + length(matches_data) + 
            length(standings_data) + length(results_data) + length(pdf_info_data)) as total_size
      FROM t_archived_tournament_json
    `);

    if (sizeResult.rows.length > 0 && sizeResult.rows[0].total_size) {
      const totalSize = sizeResult.rows[0].total_size;
      console.log(`   総データサイズ: ${(totalSize / 1024).toFixed(2)} KB (${(totalSize / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`   平均アーカイブサイズ: ${(totalSize / archivesResult.rows.length / 1024).toFixed(2)} KB`);
    }

    console.log('\n✅ アーカイブデータチェック完了！');

  } catch (error) {
    console.error('🔥 チェックエラー:', error);
  } finally {
    db.close();
  }
}

checkArchiveData();