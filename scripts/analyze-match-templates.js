// scripts/analyze-match-templates.js
// m_match_templatesの構造を分析して汎用的順位判定の検討材料とする

const { createClient } = require('@libsql/client');

const db = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2NmY1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function analyzeMatchTemplates() {
  try {
    console.log('=== m_match_templates 構造分析 ===\n');
    
    // 利用可能なフォーマット一覧
    const formatsResult = await db.execute({
      sql: 'SELECT format_id, format_name, target_team_count FROM m_tournament_formats ORDER BY target_team_count',
      args: []
    });
    
    console.log('🏆 利用可能フォーマット:');
    formatsResult.rows.forEach(format => {
      console.log(`  Format ${format.format_id}: ${format.format_name} (${format.target_team_count}チーム)`);
    });
    console.log();

    // 各フォーマットの決勝トーナメント構造を分析
    for (const format of formatsResult.rows) {
      console.log(`📊 === Format ${format.format_id} (${format.target_team_count}チーム) 分析 ===`);
      
      const templatesResult = await db.execute({
        sql: `
          SELECT 
            match_code, 
            round_name, 
            execution_priority, 
            team1_source, 
            team2_source,
            match_number
          FROM m_match_templates 
          WHERE format_id = ? AND phase = 'final' 
          ORDER BY match_number
        `,
        args: [format.format_id]
      });
      
      if (templatesResult.rows.length === 0) {
        console.log('  決勝トーナメントなし（予選のみ）\n');
        continue;
      }
      
      // round_nameでグループ化
      const byRound = {};
      const byPriority = {};
      
      templatesResult.rows.forEach(row => {
        const round = row.round_name;
        const priority = row.execution_priority;
        
        if (!byRound[round]) byRound[round] = [];
        if (!byPriority[priority]) byPriority[priority] = [];
        
        byRound[round].push(row);
        byPriority[priority].push(row);
      });
      
      console.log('  📋 ラウンド別構造:');
      Object.entries(byRound).forEach(([round, matches]) => {
        console.log(`    ${round}: ${matches.length}試合`);
        matches.forEach(match => {
          console.log(`      ${match.match_code}: ${match.team1_source} vs ${match.team2_source}`);
        });
      });
      
      console.log('\n  ⏱️  優先度別実行順序:');
      Object.entries(byPriority).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([priority, matches]) => {
        console.log(`    Priority ${priority}: ${matches.map(m => m.match_code).join(', ')}`);
      });
      
      console.log();
    }
    
    // 汎用的順位判定に必要な情報の検討
    console.log('🔍 === 汎用順位判定に必要な情報分析 ===');
    
    // 各ラウンドの敗退チーム数を計算する方法を検討
    const format36Result = await db.execute({
      sql: `
        SELECT DISTINCT round_name, execution_priority 
        FROM m_match_templates 
        WHERE format_id = 2 AND phase = 'final' 
        ORDER BY execution_priority DESC
      `,
      args: []
    });
    
    console.log('36チーム決勝トーナメントのラウンド構造:');
    format36Result.rows.forEach(row => {
      console.log(`  ${row.round_name} (Priority: ${row.execution_priority})`);
    });
    
  } catch (error) {
    console.error('分析エラー:', error);
  } finally {
    process.exit(0);
  }
}

analyzeMatchTemplates();