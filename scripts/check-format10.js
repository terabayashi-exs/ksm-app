const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkFormat10() {
  try {
    // フォーマットID:10の情報を確認
    const formatResult = await db.execute('SELECT * FROM m_tournament_formats WHERE format_id = 10');
    console.log('=== フォーマットID:10の情報 ===');
    console.log(formatResult.rows[0]);
    console.log('');
    
    // 決勝トーナメントの試合テンプレートを確認
    const matchesResult = await db.execute(`
      SELECT 
        match_number,
        match_code,
        match_type,
        phase,
        round_name,
        block_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name,
        execution_priority
      FROM m_match_templates 
      WHERE format_id = 10 AND phase = 'final'
      ORDER BY match_number
    `);
    
    console.log('=== 決勝トーナメントの試合構造 ===');
    console.log('試合数:', matchesResult.rows.length);
    console.log('');
    
    // M1〜M36の試合を詳細確認
    console.log('=== M1〜M36の詳細 ===');
    matchesResult.rows.forEach(match => {
      if (match.match_code.startsWith('M')) {
        console.log(`${match.match_code} (${match.round_name}):`);
        console.log(`  team1_source: ${match.team1_source || 'なし'}`);
        console.log(`  team2_source: ${match.team2_source || 'なし'}`);
        console.log(`  team1_display_name: ${match.team1_display_name}`);
        console.log(`  team2_display_name: ${match.team2_display_name}`);
        console.log(`  execution_priority: ${match.execution_priority}`);
        console.log('');
      }
    });
    
    // ラウンド別の集計
    const roundCounts = {};
    matchesResult.rows.forEach(match => {
      if (!roundCounts[match.round_name]) {
        roundCounts[match.round_name] = 0;
      }
      roundCounts[match.round_name]++;
    });
    
    console.log('=== ラウンド別試合数 ===');
    Object.entries(roundCounts).forEach(([round, count]) => {
      console.log(`${round}: ${count}試合`);
    });
    
    // team_sourceのパターンを分析
    console.log('\n=== team_sourceパターン分析 ===');
    const sourcePatterns = new Set();
    matchesResult.rows.forEach(match => {
      if (match.team1_source) sourcePatterns.add(match.team1_source);
      if (match.team2_source) sourcePatterns.add(match.team2_source);
    });
    
    console.log('使用されているsourceパターン:');
    Array.from(sourcePatterns).sort().forEach(pattern => {
      console.log(`  ${pattern}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkFormat10();