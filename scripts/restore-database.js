#!/usr/bin/env node

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 色付きメッセージ出力用の関数
const print = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

// 引数チェック
if (process.argv.length < 3) {
  print.error('使用方法: node restore-database.js <dump-file.sql> [--force]');
  process.exit(1);
}

const dumpFile = process.argv[2];
const forceFlag = process.argv.includes('--force');

// ファイルの存在確認
if (!fs.existsSync(dumpFile)) {
  print.error(`ダンプファイルが見つかりません: ${dumpFile}`);
  process.exit(1);
}

// 環境変数から開発用データベース接続情報を取得
require('dotenv').config();
const databaseUrl = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  print.error('環境変数 DATABASE_URL と DATABASE_AUTH_TOKEN が設定されていません。');
  process.exit(1);
}

// 開発環境の確認
if (!databaseUrl.includes('ksm-dev')) {
  print.error('開発用データベースURLではありません。安全のため処理を中止します。');
  print.error(`現在のURL: ${databaseUrl}`);
  process.exit(1);
}

// データベースクライアントを作成
const client = createClient({
  url: databaseUrl,
  authToken: authToken,
});

// SQLファイルを読み込んで実行
async function restoreDatabase() {
  print.info(`リストア先データベース: ${databaseUrl}`);
  print.info(`ダンプファイル: ${dumpFile}`);
  print.info(`ファイルサイズ: ${(fs.statSync(dumpFile).size / 1024).toFixed(2)} KB`);

  if (!forceFlag) {
    print.warning('このコマンドは既存のデータをすべて削除し、新しいデータで置き換えます。');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question('続行しますか？ (yes/no): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      print.info('処理をキャンセルしました。');
      process.exit(0);
    }
  }

  try {
    print.info('ダンプファイルを読み込み中...');
    const sqlContent = fs.readFileSync(dumpFile, 'utf8');
    
    // SQLコマンドを個別に分割（セミコロンで分割するが、文字列内のセミコロンは無視）
    const sqlCommands = [];
    let currentCommand = '';
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < sqlContent.length; i++) {
      const char = sqlContent[i];
      const prevChar = i > 0 ? sqlContent[i - 1] : '';
      
      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
      }
      
      currentCommand += char;
      
      if (!inString && char === ';') {
        const trimmed = currentCommand.trim();
        if (trimmed && 
            !trimmed.startsWith('--') && 
            !trimmed.startsWith('PRAGMA foreign_keys') &&
            !trimmed.startsWith('DROP TABLE') &&
            !trimmed.startsWith('CREATE TABLE') &&
            trimmed !== 'BEGIN TRANSACTION;' &&
            trimmed !== 'COMMIT;') {
          sqlCommands.push(trimmed);
        }
        currentCommand = '';
      }
    }

    print.info(`実行するSQLコマンド数: ${sqlCommands.length}`);

    // 既存のデータをクリア（外部キー制約を一時的に無効化）
    print.info('既存のデータをクリア中...');
    await client.execute('PRAGMA foreign_keys=OFF;');
    
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);

    for (const table of tables.rows) {
      const tableName = table[0];
      print.info(`テーブル ${tableName} をクリア中...`);
      await client.execute(`DELETE FROM ${tableName};`);
    }
    
    await client.execute('PRAGMA foreign_keys=ON;');

    // SQLコマンドを実行（外部キー制約を無効化）
    print.info('新しいデータをリストア中...');
    await client.execute('PRAGMA foreign_keys=OFF;');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < sqlCommands.length; i++) {
      const command = sqlCommands[i];
      
      try {
        // 進捗表示
        if (i % 100 === 0) {
          process.stdout.write(`\r進捗: ${i}/${sqlCommands.length} (${Math.round(i/sqlCommands.length*100)}%)`);
        }
        
        await client.execute(command);
        successCount++;
      } catch (error) {
        errorCount++;
        if (errorCount <= 5) {
          print.error(`\nコマンド実行エラー: ${error.message}`);
          print.error(`失敗したコマンド: ${command.substring(0, 100)}...`);
        }
      }
    }
    
    await client.execute('PRAGMA foreign_keys=ON;');
    
    process.stdout.write(`\r進捗: ${sqlCommands.length}/${sqlCommands.length} (100%)\n`);

    // 結果の確認
    print.success(`リストアが完了しました！`);
    print.info(`成功: ${successCount}個のコマンド`);
    if (errorCount > 0) {
      print.warning(`失敗: ${errorCount}個のコマンド`);
    }

    // テーブルごとのレコード数を表示
    print.info('\nリストア後のデータ確認:');
    for (const table of tables.rows) {
      const tableName = table[0];
      const countResult = await client.execute(`SELECT COUNT(*) as count FROM ${tableName};`);
      const count = countResult.rows[0][0];
      if (count > 0) {
        print.info(`  ${tableName}: ${count}件`);
      }
    }

  } catch (error) {
    print.error(`リストア処理中にエラーが発生しました: ${error.message}`);
    process.exit(1);
  }
}

// メイン処理を実行
restoreDatabase().then(() => {
  print.success('すべての処理が完了しました。');
  process.exit(0);
}).catch((error) => {
  print.error(`予期しないエラー: ${error.message}`);
  process.exit(1);
});