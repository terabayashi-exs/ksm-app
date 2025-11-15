// scripts/add-archive-version-fields.js
const { createClient } = require('@libsql/client');

// 環境変数を取得
const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  console.error('❌ 環境変数が設定されていません:');
  console.error('   DATABASE_URL:', !!databaseUrl);
  console.error('   DATABASE_AUTH_TOKEN:', !!authToken);
  process.exit(1);
}

const db = createClient({
  url: databaseUrl,
  authToken: authToken,
});

async function addArchiveVersionFields() {
  try {
    console.log('🔧 t_tournamentsテーブルにアーカイブバージョン管理フィールドを追加中...');

    // アーカイブUIバージョンフィールドを追加
    await db.execute(`
      ALTER TABLE t_tournaments 
      ADD COLUMN archive_ui_version TEXT DEFAULT NULL
    `);
    console.log('✅ archive_ui_version フィールドを追加しました');

    // アーカイブ日時フィールドを追加
    await db.execute(`
      ALTER TABLE t_tournaments 
      ADD COLUMN archived_at DATETIME DEFAULT NULL
    `);
    console.log('✅ archived_at フィールドを追加しました');

    // アーカイブ実行者フィールドを追加
    await db.execute(`
      ALTER TABLE t_tournaments 
      ADD COLUMN archived_by TEXT DEFAULT NULL
    `);
    console.log('✅ archived_by フィールドを追加しました');

    // 既存のアーカイブ済み大会にデフォルトバージョンを設定
    const result = await db.execute(`
      SELECT tournament_id, tournament_name 
      FROM t_tournaments 
      WHERE is_archived = 1 AND archive_ui_version IS NULL
    `);

    if (result.rows.length > 0) {
      console.log(`\n🔄 ${result.rows.length}件の既存アーカイブ大会にデフォルトバージョン(1.0)を設定中...`);

      for (const row of result.rows) {
        await db.execute(`
          UPDATE t_tournaments 
          SET 
            archive_ui_version = '1.0',
            archived_at = COALESCE(archived_at, datetime('now', '+9 hours')),
            archived_by = COALESCE(archived_by, 'system_migration')
          WHERE tournament_id = ?
        `, [row.tournament_id]);

        console.log(`   ✅ ${row.tournament_name} (ID: ${row.tournament_id})`);
      }
    }

    // 結果確認
    const confirmResult = await db.execute(`
      SELECT 
        tournament_id, 
        tournament_name, 
        is_archived,
        archive_ui_version,
        archived_at,
        archived_by
      FROM t_tournaments 
      WHERE is_archived = 1
      ORDER BY tournament_id
    `);

    console.log('\n📊 アーカイブバージョン管理フィールド追加完了！');
    console.log('現在のアーカイブ大会一覧:');
    console.log('----------------------------------------');
    
    if (confirmResult.rows.length === 0) {
      console.log('アーカイブ済み大会はありません');
    } else {
      for (const row of confirmResult.rows) {
        console.log(`ID: ${row.tournament_id} | ${row.tournament_name}`);
        console.log(`   バージョン: ${row.archive_ui_version || 'なし'}`);
        console.log(`   アーカイブ日時: ${row.archived_at || 'なし'}`);
        console.log(`   実行者: ${row.archived_by || 'なし'}`);
        console.log('');
      }
    }

  } catch (error) {
    // フィールドが既に存在する場合のエラーハンドリング
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('⚠️  フィールドは既に存在します - スキップします');
    } else {
      console.error('❌ エラーが発生しました:', error);
      process.exit(1);
    }
  } finally {
    await db.close();
  }
}

addArchiveVersionFields();