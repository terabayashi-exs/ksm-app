const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkFormat10All() {
  try {
    // フォーマットID:10の全試合テンプレートを確認
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
      WHERE format_id = 10
      ORDER BY match_number
    `);
    
    console.log('=== フォーマットID:10の全試合 ===');
    console.log('総試合数:', matchesResult.rows.length);
    console.log('');
    
    // フェーズ別集計
    const phaseGroups = {};
    matchesResult.rows.forEach(match => {
      if (!phaseGroups[match.phase]) {
        phaseGroups[match.phase] = [];
      }
      phaseGroups[match.phase].push(match);
    });
    
    console.log('=== フェーズ別集計 ===');
    Object.entries(phaseGroups).forEach(([phase, matches]) => {
      console.log(`${phase}: ${matches.length}試合`);
    });
    console.log('');
    
    // 予選試合の確認
    if (phaseGroups.preliminary) {
      console.log('=== 予選試合サンプル（最初の10試合）===');
      phaseGroups.preliminary.slice(0, 10).forEach(match => {
        console.log(`${match.match_code} (${match.block_name}ブロック): ${match.team1_display_name} vs ${match.team2_display_name}`);
      });
      console.log('');
      
      // ブロック別集計
      const blockCounts = {};
      phaseGroups.preliminary.forEach(match => {
        if (!blockCounts[match.block_name]) {
          blockCounts[match.block_name] = 0;
        }
        blockCounts[match.block_name]++;
      });
      
      console.log('=== ブロック別試合数 ===');
      Object.entries(blockCounts).sort().forEach(([block, count]) => {
        console.log(`${block}ブロック: ${count}試合`);
      });
    }
    
    // 決勝試合の確認
    if (phaseGroups.final) {
      console.log('\n=== 決勝トーナメント試合 ===');
      phaseGroups.final.forEach(match => {
        console.log(`${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
        if (match.team1_source || match.team2_source) {
          console.log(`  sources: ${match.team1_source || 'なし'} vs ${match.team2_source || 'なし'}`);
        }
      });
    } else {
      console.log('\n=== 決勝トーナメント試合が見つかりません ===');
    }
    
    // 全フォーマットの概要も確認
    console.log('\n=== 全フォーマット一覧 ===');
    const formatsResult = await db.execute('SELECT format_id, format_name, target_team_count FROM m_tournament_formats ORDER BY format_id');
    formatsResult.rows.forEach(format => {
      console.log(`ID:${format.format_id} - ${format.format_name} (${format.target_team_count}チーム)`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkFormat10All();