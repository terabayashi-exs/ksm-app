const { createClient } = require('@libsql/client');

// 開発環境のデータベース接続情報
const DEV_DB_URL = "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io";
const DEV_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA";

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

async function checkMatchBlocks() {
  console.log('=== t_match_blocks テーブル比較 ===\n');

  const devClient = createClient({
    url: DEV_DB_URL,
    authToken: DEV_DB_TOKEN
  });

  const prodClient = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    // 開発環境のt_match_blocksを確認
    console.log('【開発環境 (ksm-dev)】');
    const devResult = await devClient.execute(`
      SELECT 
        match_block_id,
        tournament_id,
        block_name,
        LENGTH(team_rankings) as rankings_size,
        updated_at
      FROM t_match_blocks
      ORDER BY tournament_id, block_name
    `);

    console.log(`行数: ${devResult.rows.length}`);
    for (const row of devResult.rows) {
      const hasRankings = row.rankings_size > 0 ? `(${row.rankings_size} bytes)` : '(なし)';
      console.log(`  - T${row.tournament_id} ${row.block_name}: ${hasRankings} - ${row.updated_at}`);
    }

    // 本番環境のt_match_blocksを確認
    console.log('\n【本番環境 (ksm-main)】');
    const prodResult = await prodClient.execute(`
      SELECT 
        match_block_id,
        tournament_id,
        block_name,
        LENGTH(team_rankings) as rankings_size,
        updated_at
      FROM t_match_blocks
      ORDER BY tournament_id, block_name
    `);

    console.log(`行数: ${prodResult.rows.length}`);
    for (const row of prodResult.rows) {
      const hasRankings = row.rankings_size > 0 ? `(${row.rankings_size} bytes)` : '(なし)';
      console.log(`  - T${row.tournament_id} ${row.block_name}: ${hasRankings} - ${row.updated_at}`);
    }

    // 差分を分析
    console.log('\n【差分分析】');
    
    // team_rankingsが存在するブロック数を比較
    const devWithRankings = devResult.rows.filter(row => row.rankings_size > 0);
    const prodWithRankings = prodResult.rows.filter(row => row.rankings_size > 0);
    
    console.log(`開発環境で順位データあり: ${devWithRankings.length}ブロック`);
    console.log(`本番環境で順位データあり: ${prodWithRankings.length}ブロック`);
    
    if (devWithRankings.length !== prodWithRankings.length) {
      console.log('❌ 順位データのあるブロック数が一致しません！');
      
      console.log('\n開発環境のみにある順位データ:');
      for (const devBlock of devWithRankings) {
        const prodBlock = prodResult.rows.find(p => 
          p.tournament_id === devBlock.tournament_id && 
          p.block_name === devBlock.block_name
        );
        if (!prodBlock || prodBlock.rankings_size === 0) {
          console.log(`  - T${devBlock.tournament_id} ${devBlock.block_name} (${devBlock.rankings_size} bytes)`);
        }
      }
    } else {
      console.log('✅ 順位データのあるブロック数は一致しています');
    }

    // 特定の順位データを詳細確認（サンプル）
    if (devWithRankings.length > 0) {
      console.log('\n【順位データサンプル確認】');
      const sampleBlock = devWithRankings[0];
      
      const devSample = await devClient.execute(`
        SELECT team_rankings 
        FROM t_match_blocks 
        WHERE tournament_id = ? AND block_name = ?
      `, [sampleBlock.tournament_id, sampleBlock.block_name]);
      
      const prodSample = await prodClient.execute(`
        SELECT team_rankings 
        FROM t_match_blocks 
        WHERE tournament_id = ? AND block_name = ?
      `, [sampleBlock.tournament_id, sampleBlock.block_name]);

      console.log(`サンプル: T${sampleBlock.tournament_id} ${sampleBlock.block_name}`);
      console.log(`開発環境: ${devSample.rows[0]?.team_rankings ? '順位データあり' : 'なし'}`);
      console.log(`本番環境: ${prodSample.rows[0]?.team_rankings ? '順位データあり' : 'なし'}`);
      
      if (devSample.rows[0]?.team_rankings) {
        try {
          const rankings = JSON.parse(devSample.rows[0].team_rankings);
          console.log(`順位数: ${rankings.length}チーム`);
          if (rankings.length > 0) {
            console.log(`1位チーム: ${rankings[0].team_name} (${rankings[0].points}点)`);
          }
        } catch (error) {
          console.log('JSON解析エラー:', error.message);
        }
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// 実行
checkMatchBlocks().catch(console.error);