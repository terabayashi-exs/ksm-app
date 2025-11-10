// scripts/migrate-archives-to-blob.js
const { db } = require('../lib/db');
const { TournamentBlobArchiver } = require('../lib/tournament-blob-archiver');
const { BlobStorage } = require('../lib/blob-storage');

/**
 * 既存のDBアーカイブをBlobに移行するスクリプト
 */
async function migrateArchivesToBlob() {
  console.log('🎯 既存アーカイブのBlob移行を開始します...');
  
  try {
    // 1. 既存のアーカイブ一覧を取得
    const result = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
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
      ORDER BY archived_at DESC
    `);

    const archives = result.rows;
    console.log(`📊 移行対象: ${archives.length}件のアーカイブ`);

    if (archives.length === 0) {
      console.log('✅ 移行対象のアーカイブがありません');
      return;
    }

    // 2. 各アーカイブをBlobに移行
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < archives.length; i++) {
      const archive = archives[i];
      const progress = `[${i + 1}/${archives.length}]`;
      
      console.log(`${progress} 移行中: ${archive.tournament_name} (ID: ${archive.tournament_id})`);
      
      try {
        // DBデータを Blob形式に変換
        const tournamentArchive = {
          version: '1.0',
          archived_at: archive.archived_at,
          archived_by: archive.archived_by,
          tournament: JSON.parse(archive.tournament_data),
          teams: JSON.parse(archive.teams_data),
          matches: JSON.parse(archive.matches_data),
          standings: JSON.parse(archive.standings_data),
          results: JSON.parse(archive.results_data || '[]'),
          pdf_info: JSON.parse(archive.pdf_info_data || '{}'),
          metadata: JSON.parse(archive.metadata || '{}')
        };

        // データサイズ計算
        const jsonString = JSON.stringify(tournamentArchive, null, 2);
        const fileSize = Buffer.byteLength(jsonString, 'utf8');
        tournamentArchive.metadata.file_size = fileSize;

        // Blobに保存
        const archivePath = `tournaments/${archive.tournament_id}/archive.json`;
        await BlobStorage.putJson(archivePath, tournamentArchive);

        // インデックスに追加
        await TournamentBlobArchiver.updateIndex({
          tournament_id: archive.tournament_id,
          tournament_name: archive.tournament_name,
          archived_at: archive.archived_at,
          archived_by: archive.archived_by,
          file_size: fileSize,
          blob_url: archivePath,
          metadata: {
            total_teams: tournamentArchive.metadata.total_teams || 0,
            total_matches: tournamentArchive.metadata.total_matches || 0,
            archive_ui_version: tournamentArchive.metadata.archive_ui_version || '1.0'
          }
        });

        console.log(`  ✅ 成功 (${(fileSize / 1024).toFixed(2)} KB)`);
        results.success++;

      } catch (error) {
        console.error(`  ❌ 失敗: ${error.message}`);
        results.failed++;
        results.errors.push({
          tournament_id: archive.tournament_id,
          tournament_name: archive.tournament_name,
          error: error.message
        });
      }

      // 少し待機（API制限回避）
      if (i < archives.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 3. 移行結果レポート
    console.log('\n📋 移行結果レポート');
    console.log(`✅ 成功: ${results.success}件`);
    console.log(`❌ 失敗: ${results.failed}件`);
    
    if (results.errors.length > 0) {
      console.log('\n🔍 失敗詳細:');
      results.errors.forEach(err => {
        console.log(`  - ${err.tournament_name} (ID: ${err.tournament_id}): ${err.error}`);
      });
    }

    // 4. 検証
    if (results.success > 0) {
      console.log('\n🔍 移行データ検証中...');
      await verifyMigration();
    }

    console.log('\n🎉 移行処理が完了しました！');

  } catch (error) {
    console.error('🔥 移行処理中にエラーが発生しました:', error);
    process.exit(1);
  }
}

/**
 * 移行データの検証
 */
async function verifyMigration() {
  try {
    // Blobインデックスを取得
    const blobArchives = await TournamentBlobArchiver.getArchiveIndex();
    
    // DBアーカイブを取得
    const dbResult = await db.execute('SELECT COUNT(*) as count FROM t_archived_tournament_json');
    const dbCount = dbResult.rows[0].count;

    console.log(`  📊 DB: ${dbCount}件, Blob: ${blobArchives.length}件`);
    
    if (blobArchives.length === dbCount) {
      console.log('  ✅ 件数一致');
    } else {
      console.log('  ⚠️ 件数不一致 - 詳細確認が必要');
    }

    // サンプル検証
    if (blobArchives.length > 0) {
      const sampleId = blobArchives[0].tournament_id;
      const blobData = await TournamentBlobArchiver.getArchivedTournament(sampleId);
      
      if (blobData) {
        console.log(`  ✅ サンプルデータ取得成功 (ID: ${sampleId})`);
      } else {
        console.log(`  ❌ サンプルデータ取得失敗 (ID: ${sampleId})`);
      }
    }

  } catch (error) {
    console.error('  ❌ 検証エラー:', error.message);
  }
}

/**
 * メイン実行
 */
async function main() {
  // 環境変数チェック
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ BLOB_READ_WRITE_TOKEN が設定されていません');
    console.log('設定方法: https://docs.blob-setup-guide.md を参照');
    process.exit(1);
  }

  console.log('🔧 環境設定確認済み');
  console.log(`Token: ${process.env.BLOB_READ_WRITE_TOKEN.substring(0, 20)}...`);
  
  // 確認プロンプト
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question('既存アーカイブをBlobに移行しますか？ (y/N): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('移行をキャンセルしました');
    process.exit(0);
  }

  await migrateArchivesToBlob();
}

// 直接実行時のみmainを呼び出し
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { migrateArchivesToBlob, verifyMigration };