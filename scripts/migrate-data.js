#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 色付きメッセージ出力用の関数
const print = {
  info: (msg) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`)
};

// 本番データベース情報
const PROD_DATABASE_URL = 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io';
const PROD_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg';

// スクリプトのパス
const scriptsDir = path.join(__dirname);
const dumpScript = path.join(scriptsDir, 'turso-dump.js');
const restoreScript = path.join(scriptsDir, 'restore-database.js');

// 実行権限の確認
if (!fs.existsSync(dumpScript)) {
  print.error(`ダンプスクリプトが見つかりません: ${dumpScript}`);
  process.exit(1);
}

if (!fs.existsSync(restoreScript)) {
  print.error(`リストアスクリプトが見つかりません: ${restoreScript}`);
  process.exit(1);
}

async function migrateData() {
  print.info('本番データベースから開発データベースへのデータ移行を開始します。');
  print.info('========================================================');
  
  try {
    // Step 1: 本番データベースからダンプ
    print.info('\n[Step 1/2] 本番データベースからデータをダンプ中...');
    const dumpCommand = `node "${dumpScript}" "${PROD_DATABASE_URL}" "${PROD_AUTH_TOKEN}"`;
    
    const dumpOutput = execSync(dumpCommand, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // ダンプファイル名を取得（最後の行から）
    const outputLines = dumpOutput.trim().split('\n');
    const dumpFile = outputLines[outputLines.length - 1].trim();
    
    if (!dumpFile.endsWith('.sql')) {
      throw new Error('ダンプファイル名を取得できませんでした。');
    }
    
    print.success(`ダンプファイルが作成されました: ${dumpFile}`);
    
    // Step 2: 開発データベースへリストア
    print.info('\n[Step 2/2] 開発データベースへデータをリストア中...');
    const restoreCommand = `node "${restoreScript}" "${dumpFile}" --force`;
    
    execSync(restoreCommand, { 
      encoding: 'utf8',
      stdio: 'inherit'
    });
    
    print.success('\n========================================================');
    print.success('データ移行が完了しました！');
    print.info(`ダンプファイル: ${dumpFile}`);
    print.info('開発環境でのデータ確認が可能になりました。');
    
  } catch (error) {
    print.error('\n========================================================');
    print.error('データ移行中にエラーが発生しました:');
    print.error(error.message);
    
    if (error.stdout) {
      print.error('標準出力:');
      console.error(error.stdout);
    }
    
    if (error.stderr) {
      print.error('エラー出力:');
      console.error(error.stderr);
    }
    
    process.exit(1);
  }
}

// メイン処理を実行
migrateData();