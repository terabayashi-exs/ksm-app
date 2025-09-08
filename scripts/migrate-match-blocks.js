const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

// 開発環境のデータベース接続情報
const DEV_DB_URL = "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io";
const DEV_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA";

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function migrateMatchBlocks() {
  const devClient = createClient({
    url: DEV_DB_URL,
    authToken: DEV_DB_TOKEN
  });

  const prodClient = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('=== t_match_blocks データ移行 ===\n');

    // 1. 本番環境のバックアップ（念のため）
    console.log('1. 本番環境のt_match_blocksをバックアップ中...');
    const prodBackup = await prodClient.execute(`
      SELECT * FROM t_match_blocks
      ORDER BY match_block_id
    `);
    
    const backupPath = path.join(__dirname, `../data/backup-match-blocks-${new Date().toISOString().split('T')[0]}.json`);
    await fs.writeFile(backupPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      source: 'ksm-main',
      table: 't_match_blocks',
      rows: prodBackup.rows
    }, null, 2));
    console.log(`バックアップ保存: ${backupPath}`);

    // 2. 開発環境のデータを取得
    console.log('\n2. 開発環境のt_match_blocksデータを取得中...');
    const devData = await devClient.execute(`
      SELECT 
        match_block_id,
        tournament_id,
        block_name,
        team_rankings,
        created_at,
        updated_at
      FROM t_match_blocks
      ORDER BY match_block_id
    `);
    
    console.log(`開発環境データ数: ${devData.rows.length}行`);

    // 3. 本番環境のデータを全削除
    console.log('\n3. 本番環境のt_match_blocksをクリア中...');
    await prodClient.execute(`DELETE FROM t_match_blocks`);
    console.log('削除完了');

    // 4. 開発環境のデータを本番環境に挿入
    console.log('\n4. 開発環境データを本番環境に移行中...');
    let successCount = 0;
    let errorCount = 0;

    for (const row of devData.rows) {
      try {
        await prodClient.execute(`
          INSERT INTO t_match_blocks (
            match_block_id,
            tournament_id,
            block_name,
            team_rankings,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          row.match_block_id,
          row.tournament_id,
          row.block_name,
          row.team_rankings,
          row.created_at,
          row.updated_at
        ]);
        
        successCount++;
        
        // 順位データのサイズを表示
        const rankingsSize = row.team_rankings ? row.team_rankings.length : 0;
        const sizeInfo = rankingsSize > 0 ? `(${rankingsSize} bytes)` : '(なし)';
        console.log(`  ✅ T${row.tournament_id} ${row.block_name}: ${sizeInfo}`);
        
      } catch (error) {
        errorCount++;
        console.error(`  ❌ T${row.tournament_id} ${row.block_name}: ${error.message}`);
      }
    }

    console.log(`\n移行完了: 成功 ${successCount}件 / エラー ${errorCount}件`);

    // 5. 移行後の検証
    console.log('\n5. 移行後の検証中...');
    const verifyResult = await prodClient.execute(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN team_rankings IS NOT NULL AND team_rankings != '' THEN 1 ELSE 0 END) as with_rankings
      FROM t_match_blocks
    `);

    const totalCount = verifyResult.rows[0].total_count;
    const withRankings = verifyResult.rows[0].with_rankings;
    
    console.log(`総ブロック数: ${totalCount}`);
    console.log(`順位データありブロック数: ${withRankings}`);

    // 特に重要な決勝トーナメントデータを確認
    console.log('\n【決勝トーナメント順位データ確認】');
    const finalBlocks = await prodClient.execute(`
      SELECT 
        tournament_id,
        block_name,
        LENGTH(team_rankings) as size,
        updated_at
      FROM t_match_blocks
      WHERE block_name = 'final'
      ORDER BY tournament_id
    `);

    for (const block of finalBlocks.rows) {
      const sizeInfo = block.size > 0 ? `(${block.size} bytes)` : '(なし)';
      console.log(`  T${block.tournament_id} final: ${sizeInfo} - ${block.updated_at}`);
    }

    console.log('\n✅ t_match_blocks データ移行が完了しました！');

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 確認プロンプト
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== t_match_blocks データ移行ツール ===\n');
console.log('⚠️  本番環境のt_match_blocksテーブルを開発環境のデータで上書きします。');
console.log('順位表データ（team_rankings）が含まれる重要なテーブルです。');
console.log('\n実行前にバックアップを作成します。');
console.log('\n本当に実行しますか？ (yes/no): ');

rl.question('', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'yes') {
    console.log('\n移行を開始します...\n');
    migrateMatchBlocks().catch(console.error);
  } else {
    console.log('\nキャンセルしました。');
    process.exit(0);
  }
});