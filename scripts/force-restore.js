#!/usr/bin/env node

const { createClient } = require('@libsql/client');
const fs = require('fs');
require('dotenv').config();

// 色付きメッセージ出力用の関数
const print = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

if (process.argv.length < 3) {
  print.error('使用方法: node force-restore.js <dump-file.sql>');
  process.exit(1);
}

const dumpFile = process.argv[2];

if (!fs.existsSync(dumpFile)) {
  print.error(`ダンプファイルが見つかりません: ${dumpFile}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl.includes('ksm-dev')) {
  print.error('開発用データベースURLではありません。');
  process.exit(1);
}

const client = createClient({
  url: databaseUrl,
  authToken: authToken,
});

async function forceRestore() {
  print.info(`強制リストアを開始します...`);
  print.info(`データベース: ${databaseUrl}`);
  print.info(`ダンプファイル: ${dumpFile}`);

  try {
    // 外部キー制約を無効化
    print.info('外部キー制約を無効化中...');
    await client.execute('PRAGMA foreign_keys=OFF;');

    // 全テーブルのデータをクリア（削除順序を考慮）
    print.info('既存データをクリア中...');
    const deleteOrder = [
      't_tournament_players',
      't_matches_final',
      't_matches_live',
      't_match_status',
      't_tournament_notifications',
      't_tournament_teams',
      't_match_blocks',
      't_tournaments',
      'm_players',
      'm_teams',
      'm_match_templates',
      'm_tournament_formats',
      'm_venues',
      'm_administrators',
      'sample_data'
    ];

    for (const tableName of deleteOrder) {
      try {
        await client.execute(`DELETE FROM ${tableName};`);
        print.success(`${tableName} をクリアしました`);
      } catch (error) {
        print.warning(`${tableName} のクリアに失敗: ${error.message}`);
      }
    }

    // SQLファイルを読み込み
    print.info('ダンプファイルを読み込み中...');
    const sqlContent = fs.readFileSync(dumpFile, 'utf8');
    
    // INSERTコマンドのみを抽出
    const insertCommands = sqlContent
      .split('\n')
      .filter(line => line.trim().startsWith('INSERT INTO'))
      .map(line => line.trim());

    print.info(`実行するINSERTコマンド数: ${insertCommands.length}`);

    // 依存順序を考慮したテーブル順序
    const insertOrder = [
      'm_administrators',
      'm_venues',
      'm_tournament_formats',
      'm_teams',
      'm_match_templates',
      't_tournaments',
      'm_players',
      't_match_blocks',
      't_tournament_teams',
      't_matches_live',
      't_matches_final',
      't_match_status',
      't_tournament_players',
      't_tournament_notifications',
      'sample_data'
    ];

    // テーブル順序に従ってINSERTを実行
    let successCount = 0;
    let errorCount = 0;
    let errorDetails = {};

    for (const tableName of insertOrder) {
      const tableInserts = insertCommands.filter(cmd => 
        cmd.includes(`INSERT INTO ${tableName}`)
      );
      
      if (tableInserts.length > 0) {
        print.info(`${tableName} に ${tableInserts.length} 件のデータを挿入中...`);
        
        for (const cmd of tableInserts) {
          try {
            await client.execute(cmd);
            successCount++;
          } catch (error) {
            errorCount++;
            if (!errorDetails[tableName]) {
              errorDetails[tableName] = [];
            }
            if (errorDetails[tableName].length < 3) {
              errorDetails[tableName].push(error.message);
            }
          }
        }
      }
    }

    // 外部キー制約を再度有効化
    await client.execute('PRAGMA foreign_keys=ON;');

    // 結果表示
    print.success('\n強制リストアが完了しました！');
    print.info(`成功: ${successCount}件`);
    if (errorCount > 0) {
      print.warning(`失敗: ${errorCount}件`);
      print.warning('\nエラー詳細:');
      for (const [table, errors] of Object.entries(errorDetails)) {
        print.warning(`  ${table}:`);
        errors.forEach(err => print.warning(`    - ${err}`));
      }
    }

    // 最終的なデータ確認
    print.info('\n最終データ確認:');
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);

    for (const table of tables.rows) {
      const tableName = table[0];
      const result = await client.execute(`SELECT COUNT(*) as count FROM ${tableName};`);
      const count = result.rows[0]['count'];
      if (count > 0) {
        print.success(`  ${tableName}: ${count}件`);
      }
    }

  } catch (error) {
    print.error(`エラー: ${error.message}`);
    process.exit(1);
  }
}

forceRestore().then(() => {
  print.success('\nすべての処理が完了しました！');
  process.exit(0);
});