#!/usr/bin/env node

const { createClient } = require('@libsql/client');
const fs = require('fs');

// 色付きメッセージ出力用の関数
const print = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

// 引数チェック
if (process.argv.length < 4) {
  print.error('使用方法: node turso-dump.js <database-url> <auth-token>');
  process.exit(1);
}

const databaseUrl = process.argv[2];
const authToken = process.argv[3];
const dumpFile = `turso-dump-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0]}.sql`;

const client = createClient({
  url: databaseUrl,
  authToken: authToken,
});

async function exportDatabase() {
  try {
    print.info(`Tursoデータベースからデータをダンプします...`);
    print.info(`データベース: ${databaseUrl}`);
    print.info(`出力ファイル: ${dumpFile}`);

    print.info('テーブル一覧を取得中...');
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);

    let sqlDump = `-- Turso Database Dump
-- Generated at: ${new Date().toISOString()}
-- Database: ${databaseUrl}

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

`;

    for (const table of tables.rows) {
      const tableName = table[0];
      print.info(`テーブル ${tableName} をエクスポート中...`);

      // テーブル構造は既存のものを使用（DROPとCREATEをスキップ）
      // sqlDump += `-- Table: ${tableName}\n`;

      // データを取得
      const data = await client.execute(`SELECT * FROM ${tableName};`);
      if (data.rows.length > 0) {
        for (const row of data.rows) {
          // rowが配列でない場合はObjectの値を配列として取得
          const rowValues = Array.isArray(row) ? row : Object.values(row);
          
          const values = rowValues.map(value => {
            if (value === null) return 'NULL';
            if (typeof value === 'string') {
              return `'${value.replace(/'/g, "''")}'`;
            }
            return value;
          }).join(', ');
          
          const columns = data.columns.map(col => typeof col === 'string' ? col : col.name).join(', ');
          sqlDump += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
        }
        sqlDump += '\n';
      }
    }

    sqlDump += `COMMIT;
PRAGMA foreign_keys=ON;
`;

    fs.writeFileSync(dumpFile, sqlDump);
    print.success(`ダンプが完了しました: ${dumpFile}`);
    print.info(`エクスポートされたテーブル数: ${tables.rows.length}`);
    
    // ファイルサイズを表示
    const stats = fs.statSync(dumpFile);
    print.info(`ファイルサイズ: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // 簡単な検証
    if (sqlDump.includes('INSERT INTO')) {
      print.success('ダンプファイルにデータが含まれています。');
      console.log(`${dumpFile}`); // ファイル名だけを出力（migrate-data.jsで使用）
    } else {
      print.error('ダンプファイルにデータが含まれていない可能性があります。');
      process.exit(1);
    }
    
  } catch (error) {
    print.error('エラーが発生しました:');
    console.error(error.message);
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

exportDatabase();