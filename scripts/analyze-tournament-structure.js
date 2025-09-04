// scripts/analyze-tournament-structure.js
// 決勝トーナメントの構造分析スクリプト

const { createClient } = require('@libsql/client');

const db = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

async function analyzeTournamentStructure() {
  try {
    const tournamentId = 9;
    
    console.log('=== 決勝トーナメント構造分析 ===\n');
    
    // 全試合を取得
    const result = await db.execute({
      sql: `
        SELECT 
          ml.match_code, 
          ml.team1_display_name, 
          ml.team2_display_name, 
          mf.winner_team_id,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml 
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id 
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
        WHERE mb.tournament_id = ? AND mb.phase = 'final' AND ml.team1_id IS NOT NULL 
        ORDER BY ml.match_code
      `,
      args: [tournamentId]
    });
    
    // 試合コード別にラウンドを分析
    const rounds = {};
    
    result.rows.forEach(row => {
      const matchNum = parseInt(row.match_code.replace('M', ''));
      let roundName = '';
      let roundOrder = 0;
      
      // 試合番号からラウンドを判定
      if (matchNum === 36) {
        roundName = '決勝戦';
        roundOrder = 6;
      } else if (matchNum === 35) {
        roundName = '3位決定戦';
        roundOrder = 5;
      } else if (matchNum >= 33 && matchNum <= 34) {
        roundName = '準決勝';
        roundOrder = 4;
      } else if (matchNum >= 29 && matchNum <= 32) {
        roundName = '準々決勝';
        roundOrder = 3;
      } else if (matchNum >= 25 && matchNum <= 28) {
        roundName = 'Round3';
        roundOrder = 2;
      } else if (matchNum >= 17 && matchNum <= 24) {
        roundName = 'Round2';
        roundOrder = 1;
      } else {
        roundName = 'Round1';
        roundOrder = 0;
      }
      
      if (!rounds[roundName]) {
        rounds[roundName] = {
          matches: [],
          order: roundOrder
        };
      }
      
      rounds[roundName].matches.push({
        match_code: row.match_code,
        team1: row.team1_display_name,
        team2: row.team2_display_name,
        is_confirmed: Boolean(row.is_confirmed)
      });
    });
    
    // ラウンド順に表示
    Object.entries(rounds)
      .sort(([,a], [,b]) => a.order - b.order)
      .forEach(([roundName, data]) => {
        console.log(`📍 ${roundName} (${data.matches.length}試合)`);
        data.matches.forEach(match => {
          const status = match.is_confirmed ? '✅' : '⏳';
          console.log(`  ${match.match_code}: ${match.team1} vs ${match.team2} ${status}`);
        });
        console.log();
      });
    
    // 順位分類の計算
    console.log('=== 順位分類 ===');
    console.log('決勝戦参加（2チーム）→ 1位・2位');
    console.log('3位決定戦参加（2チーム）→ 3位・4位');  
    console.log('準決勝敗者（2チーム）→ 5位～6位');
    console.log('準々決勝敗者（4チーム）→ 7位～10位');
    console.log('Round3敗者（8チーム）→ 11位～18位');
    console.log('Round2敗者（8チーム）→ 19位～26位');
    console.log('Round1敗者（残り）→ 27位～');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    process.exit(0);
  }
}

analyzeTournamentStructure();