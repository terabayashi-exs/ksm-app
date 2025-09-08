const { createClient } = require('@libsql/client');

// 開発環境のデータベース接続情報
const DEV_DB_URL = "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io";
const DEV_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA";

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function updateMatchBlocks() {
  const devClient = createClient({
    url: DEV_DB_URL,
    authToken: DEV_DB_TOKEN
  });

  const prodClient = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('=== t_match_blocks 順位データ更新 ===\n');

    // 1. 開発環境のデータを取得
    console.log('1. 開発環境の順位データを取得中...');
    const devData = await devClient.execute(`
      SELECT 
        match_block_id,
        tournament_id,
        block_name,
        team_rankings,
        updated_at
      FROM t_match_blocks
      WHERE team_rankings IS NOT NULL AND team_rankings != ''
      ORDER BY tournament_id, block_name
    `);
    
    console.log(`順位データあり: ${devData.rows.length}ブロック`);

    // 2. 各ブロックの順位データを本番環境に反映
    console.log('\n2. 順位データを本番環境に反映中...');
    let successCount = 0;
    let errorCount = 0;

    for (const row of devData.rows) {
      try {
        // match_block_idで既存レコードを更新
        const result = await prodClient.execute(`
          UPDATE t_match_blocks 
          SET 
            team_rankings = ?,
            updated_at = ?
          WHERE match_block_id = ?
        `, [row.team_rankings, row.updated_at, row.match_block_id]);

        if (result.rowsAffected > 0) {
          successCount++;
          const rankingsSize = row.team_rankings ? row.team_rankings.length : 0;
          console.log(`  ✅ T${row.tournament_id} ${row.block_name}: ${rankingsSize} bytes更新`);
        } else {
          console.log(`  ⚠️  T${row.tournament_id} ${row.block_name}: 該当ブロックが見つかりませんでした`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`  ❌ T${row.tournament_id} ${row.block_name}: ${error.message}`);
      }
    }

    console.log(`\n更新完了: 成功 ${successCount}件 / エラー ${errorCount}件`);

    // 3. 更新後の検証
    console.log('\n3. 更新後の検証中...');
    
    // 決勝トーナメント順位データの確認
    const finalCheck = await prodClient.execute(`
      SELECT 
        tournament_id,
        block_name,
        LENGTH(team_rankings) as size,
        updated_at
      FROM t_match_blocks
      WHERE block_name = 'final' AND team_rankings IS NOT NULL
      ORDER BY tournament_id
    `);

    console.log('\n【決勝トーナメント順位データ】');
    for (const block of finalCheck.rows) {
      console.log(`  T${block.tournament_id} final: ${block.size} bytes - ${block.updated_at}`);
      
      // T9の決勝データを詳細確認
      if (block.tournament_id === 9 && block.size > 100) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          console.log(`    - ${rankings.length}チームの順位データ`);
          if (rankings.length > 0) {
            console.log(`    - 1位: ${rankings[0].team_name || rankings[0].team_omission}`);
          }
        } catch (e) {
          console.log(`    - JSON解析エラー`);
        }
      }
    }

    // 予選ブロック順位データの確認
    const prelimCheck = await prodClient.execute(`
      SELECT 
        COUNT(*) as total,
        tournament_id
      FROM t_match_blocks
      WHERE block_name != 'final' AND team_rankings IS NOT NULL AND team_rankings != ''
      GROUP BY tournament_id
      ORDER BY tournament_id
    `);

    console.log('\n【予選ブロック順位データ】');
    for (const stat of prelimCheck.rows) {
      console.log(`  T${stat.tournament_id}: ${stat.total}ブロック`);
    }

    console.log('\n✅ 順位データの更新が完了しました！');

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
console.log('=== t_match_blocks 順位データ更新ツール ===\n');
console.log('外部キー制約を回避し、UPDATEで順位データのみを更新します。');
console.log('削除・挿入は行わず、安全に順位データを反映します。\n');
updateMatchBlocks().catch(console.error);