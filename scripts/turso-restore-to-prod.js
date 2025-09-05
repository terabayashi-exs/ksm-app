const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function restoreDatabase() {
  const client = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('本番環境のデータベースに接続中...\n');

    // ダンプファイルを読み込み
    const dumpPath = path.join(__dirname, '../data/dump-dev-2025-09-05.json');
    console.log(`ダンプファイルを読み込み中: ${dumpPath}`);
    const dumpData = JSON.parse(await fs.readFile(dumpPath, 'utf8'));
    
    console.log(`\nソース: ${dumpData.source}`);
    console.log(`ダンプ日時: ${dumpData.timestamp}`);
    console.log(`テーブル数: ${Object.keys(dumpData.tables).length}\n`);

    // 処理するテーブルの順序（外部キー制約を考慮）
    const tableOrder = [
      'm_venues',
      'm_tournament_formats',
      'm_match_templates',
      'm_administrators',
      'm_teams',
      'm_players',
      't_tournaments',
      't_tournament_teams',
      't_tournament_players',
      't_match_blocks',
      't_matches_live',
      't_matches_final',
      't_match_status',
      't_tournament_notifications',
      'sample_data'
    ];

    // 各テーブルのデータを削除して再挿入
    for (const tableName of tableOrder) {
      if (dumpData.tables[tableName]) {
        console.log(`\n処理中: ${tableName}`);
        const tableData = dumpData.tables[tableName];
        
        try {
          // 既存データを削除
          await client.execute(`DELETE FROM ${tableName}`);
          console.log(`  - 既存データを削除しました`);
          
          // 新しいデータを挿入
          if (tableData.data.length > 0) {
            // カラム名を取得
            const columns = Object.keys(tableData.data[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
            
            let insertedCount = 0;
            for (const row of tableData.data) {
              const values = columns.map(col => row[col]);
              await client.execute({
                sql: insertSql,
                args: values
              });
              insertedCount++;
              
              // 進捗表示
              if (insertedCount % 10 === 0) {
                process.stdout.write(`\r  - ${insertedCount}/${tableData.data.length}行を挿入中...`);
              }
            }
            
            console.log(`\r  - ${insertedCount}行のデータを挿入しました`);
          } else {
            console.log(`  - データなし（スキップ）`);
          }
          
        } catch (error) {
          console.error(`  ❌ エラー: ${error.message}`);
          // エラーが発生してもプロセスは続行
        }
      }
    }

    console.log('\n\n=== 復元後のデータベース統計情報 ===');
    
    // 重要なテーブルの行数を確認
    const importantTables = ['t_tournaments', 't_tournament_teams', 't_matches_live', 't_matches_final'];
    for (const tableName of importantTables) {
      const result = await client.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      console.log(`${tableName}: ${result.rows[0].count}行`);
    }

    console.log('\n✅ データベースの復元が完了しました！');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 確認プロンプト
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== Turso本番環境データベース復元ツール ===\n');
console.log('⚠️  警告: これから本番環境のデータベースを上書きします！');
console.log('現在のデータは全て削除され、開発環境のデータで置き換えられます。');
console.log('\nバックアップファイル: data/backup-prod-2025-09-05.json が作成されています。');
console.log('復元元ファイル: data/dump-dev-2025-09-05.json');
console.log('\n本当に実行しますか？ (yes/no): ');

rl.question('', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'yes') {
    console.log('\n復元を開始します...\n');
    restoreDatabase().catch(console.error);
  } else {
    console.log('\nキャンセルしました。');
    process.exit(0);
  }
});