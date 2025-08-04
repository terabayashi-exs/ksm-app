const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function checkDatabaseStatus() {
  console.log('🔍 データベースの状態を調査中...\n');

  // データベース接続
  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // 1. t_tournaments テーブルの確認
    console.log('📋 1. t_tournaments テーブルの確認');
    console.log('=' .repeat(50));
    
    const tournamentsCount = await client.execute('SELECT COUNT(*) as count FROM t_tournaments');
    console.log(`件数: ${tournamentsCount.rows[0].count}件`);
    
    if (tournamentsCount.rows[0].count > 0) {
      const tournaments = await client.execute('SELECT * FROM t_tournaments LIMIT 2');
      console.log('\nデータ例:');
      tournaments.rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.tournament_id}, 名前: ${row.tournament_name}, ステータス: ${row.status}, 公開: ${row.is_public ? 'Yes' : 'No'}`);
      });
    } else {
      console.log('データが存在しません');
    }
    
    console.log('\n');

    // 2. t_match_blocks テーブルの確認
    console.log('🏆 2. t_match_blocks テーブルの確認');
    console.log('=' .repeat(50));
    
    const matchBlocksCount = await client.execute('SELECT COUNT(*) as count FROM t_match_blocks');
    console.log(`件数: ${matchBlocksCount.rows[0].count}件`);
    
    if (matchBlocksCount.rows[0].count > 0) {
      const matchBlocks = await client.execute(`
        SELECT mb.*, t.tournament_name 
        FROM t_match_blocks mb 
        LEFT JOIN t_tournaments t ON mb.tournament_id = t.tournament_id 
        LIMIT 2
      `);
      console.log('\nデータ例:');
      matchBlocks.rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.match_block_id}, 大会: ${row.tournament_name}, フェーズ: ${row.phase}, ブロック名: ${row.block_name}`);
      });
    } else {
      console.log('データが存在しません');
    }
    
    console.log('\n');

    // 3. t_matches_live テーブルの確認
    console.log('⚽ 3. t_matches_live テーブルの確認');
    console.log('=' .repeat(50));
    
    const matchesLiveCount = await client.execute('SELECT COUNT(*) as count FROM t_matches_live');
    console.log(`件数: ${matchesLiveCount.rows[0].count}件`);
    
    if (matchesLiveCount.rows[0].count > 0) {
      const matchesLive = await client.execute(`
        SELECT ml.*, mb.block_name, t.tournament_name
        FROM t_matches_live ml
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
        LIMIT 2
      `);
      console.log('\nデータ例:');
      matchesLive.rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.match_id}, 大会: ${row.tournament_name}, ブロック: ${row.block_name}, 試合コード: ${row.match_code}`);
        console.log(`    チーム1: ${row.team1_display_name}, チーム2: ${row.team2_display_name}`);
        console.log(`    スコア: ${row.team1_goals} - ${row.team2_goals}, ステータス: ${row.match_status}`);
      });
    } else {
      console.log('データが存在しません');
    }
    
    console.log('\n');

    // 4. 関連テーブルの確認（追加情報）
    console.log('📊 4. 関連テーブルの確認');
    console.log('=' .repeat(50));
    
    const teamsCount = await client.execute('SELECT COUNT(*) as count FROM t_tournament_teams');
    console.log(`参加チーム数: ${teamsCount.rows[0].count}件`);
    
    const venuesCount = await client.execute('SELECT COUNT(*) as count FROM m_venues');
    console.log(`会場マスタ: ${venuesCount.rows[0].count}件`);
    
    const formatsCount = await client.execute('SELECT COUNT(*) as count FROM m_tournament_formats');
    console.log(`大会フォーマット: ${formatsCount.rows[0].count}件`);
    
    const templatesCount = await client.execute('SELECT COUNT(*) as count FROM m_match_templates');
    console.log(`試合テンプレート: ${templatesCount.rows[0].count}件`);

    console.log('\n✅ データベース状態の調査が完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

checkDatabaseStatus();