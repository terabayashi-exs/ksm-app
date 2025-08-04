const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

async function detailedDatabaseCheck() {
  console.log('🔍 詳細なデータベース状態を調査中...\n');

  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  try {
    // 1. t_tournaments の詳細データ
    console.log('📋 1. t_tournaments の詳細データ');
    console.log('=' .repeat(60));
    
    const tournaments = await client.execute('SELECT * FROM t_tournaments');
    tournaments.rows.forEach((tournament) => {
      console.log(`ID: ${tournament.tournament_id}`);
      console.log(`名前: ${tournament.tournament_name}`);
      console.log(`フォーマットID: ${tournament.format_id}`);
      console.log(`会場ID: ${tournament.venue_id}`);
      console.log(`チーム数: ${tournament.team_count}`);
      console.log(`ステータス: ${tournament.status}`);
      console.log(`公開: ${tournament.is_public ? 'Yes' : 'No'}`);
      console.log(`作成日: ${tournament.created_at}`);
      console.log('---');
    });

    // 2. t_match_blocks の詳細データ
    console.log('\n🏆 2. t_match_blocks の詳細データ');
    console.log('=' .repeat(60));
    
    const matchBlocks = await client.execute(`
      SELECT mb.*, t.tournament_name 
      FROM t_match_blocks mb 
      LEFT JOIN t_tournaments t ON mb.tournament_id = t.tournament_id 
      ORDER BY mb.match_block_id
    `);
    matchBlocks.rows.forEach((block) => {
      console.log(`ブロックID: ${block.match_block_id}`);
      console.log(`大会: ${block.tournament_name} (ID: ${block.tournament_id})`);
      console.log(`フェーズ: ${block.phase}`);
      console.log(`ブロック名: ${block.block_name}`);
      console.log(`大会日: ${block.tournament_date}`);
      console.log(`作成日: ${block.created_at}`);
      console.log('---');
    });

    // 3. t_matches_live のサンプルデータ（最初の5件）
    console.log('\n⚽ 3. t_matches_live のサンプルデータ（最初の5件）');
    console.log('=' .repeat(60));
    
    const matchesLive = await client.execute(`
      SELECT ml.*, mb.block_name, mb.phase, t.tournament_name
      FROM t_matches_live ml
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
      ORDER BY ml.match_id
      LIMIT 5
    `);
    
    matchesLive.rows.forEach((match) => {
      console.log(`試合ID: ${match.match_id}`);
      console.log(`大会: ${match.tournament_name}`);
      console.log(`ブロック: ${match.block_name} (${match.phase})`);
      console.log(`試合コード: ${match.match_code}`);
      console.log(`試合番号: ${match.match_number}`);
      console.log(`チーム1: ${match.team1_display_name} (ID: ${match.team1_id || 'null'})`);
      console.log(`チーム2: ${match.team2_display_name} (ID: ${match.team2_id || 'null'})`);
      console.log(`スコア: ${match.team1_goals || 0} - ${match.team2_goals || 0}`);
      console.log(`ステータス: ${match.match_status || 'null'}`);
      console.log(`結果ステータス: ${match.result_status || 'null'}`);
      console.log(`大会日: ${match.tournament_date}`);
      console.log('---');
    });

    // 4. マスターデータの確認
    console.log('\n📊 4. マスターデータの確認');
    console.log('=' .repeat(60));
    
    // 会場マスタ
    console.log('■ 会場マスタ (m_venues)');
    const venues = await client.execute('SELECT * FROM m_venues');
    venues.rows.forEach((venue) => {
      console.log(`- ${venue.venue_name} (ID: ${venue.venue_id})`);
      console.log(`  住所: ${venue.address || 'なし'}`);
      console.log(`  コート数: ${venue.available_courts}`);
      console.log(`  アクティブ: ${venue.is_active ? 'Yes' : 'No'}`);
    });

    // 大会フォーマット
    console.log('\n■ 大会フォーマット (m_tournament_formats)');
    const formats = await client.execute('SELECT * FROM m_tournament_formats');
    formats.rows.forEach((format) => {
      console.log(`- ${format.format_name} (ID: ${format.format_id})`);
      console.log(`  対象チーム数: ${format.target_team_count}チーム`);
      console.log(`  説明: ${format.format_description || 'なし'}`);
    });

    // 試合テンプレート（サンプルのみ）
    console.log('\n■ 試合テンプレート (m_match_templates) - サンプル3件');
    const templates = await client.execute('SELECT * FROM m_match_templates LIMIT 3');
    templates.rows.forEach((template) => {
      console.log(`- 試合${template.match_number}: ${template.match_code} (ID: ${template.template_id})`);
      console.log(`  フォーマットID: ${template.format_id}`);
      console.log(`  フェーズ: ${template.phase}`);
      console.log(`  ラウンド: ${template.round_name}`);
      console.log(`  ブロック: ${template.block_name}`);
      console.log(`  チーム1: ${template.team1_display_name}`);
      console.log(`  チーム2: ${template.team2_display_name}`);
    });

    console.log('\n✅ 詳細なデータベース状態の調査が完了しました');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    client.close();
  }
}

detailedDatabaseCheck();