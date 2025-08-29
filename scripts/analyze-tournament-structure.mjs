import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 決勝トーナメントの構造を分析
 */
async function analyzeTournamentStructure() {
  try {
    console.log('🔍 決勝トーナメント構造を分析...');
    
    const finalMatches = await db.execute({
      sql: `
        SELECT 
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.team1_id,
          ml.team2_id,
          mf.winner_team_id,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
    });
    
    console.log('\n📊 試合構造:');
    
    // 試合を段階別に分類
    const rounds = {
      'Round1': [], // M1-M16 1回戦
      'Round2': [], // M17-M24 2回戦
      'Round3': [], // M25-M28 3回戦
      'QF': [],     // M29-M32 準々決勝
      'SF': [],     // M33-M34 準決勝
      '3rd': [],    // M35 3位決定戦
      'Final': []   // M36 決勝戦
    };
    
    finalMatches.rows.forEach(match => {
      const matchNum = parseInt(match.match_code.replace('M', ''));
      
      if (matchNum >= 1 && matchNum <= 16) {
        rounds['Round1'].push(match);
      } else if (matchNum >= 17 && matchNum <= 24) {
        rounds['Round2'].push(match);
      } else if (matchNum >= 25 && matchNum <= 28) {
        rounds['Round3'].push(match);
      } else if (matchNum >= 29 && matchNum <= 32) {
        rounds['QF'].push(match);
      } else if (matchNum >= 33 && matchNum <= 34) {
        rounds['SF'].push(match);
      } else if (matchNum === 35) {
        rounds['3rd'].push(match);
      } else if (matchNum === 36) {
        rounds['Final'].push(match);
      }
    });
    
    // 各段階の参加チーム数を分析
    Object.entries(rounds).forEach(([roundName, matches]) => {
      if (matches.length > 0) {
        const teams = new Set();
        matches.forEach(match => {
          if (match.team1_id) teams.add(match.team1_id);
          if (match.team2_id) teams.add(match.team2_id);
        });
        
        console.log(`${roundName}: ${matches.length}試合, ${teams.size}チーム`);
        
        // 各段階での敗退者数を計算
        let eliminatedCount = 0;
        matches.forEach(match => {
          if (match.is_confirmed && match.winner_team_id) {
            eliminatedCount++; // 1試合につき1チーム敗退
          }
        });
        
        if (eliminatedCount > 0) {
          console.log(`  敗退: ${eliminatedCount}チーム`);
        }
      }
    });
    
    // 全参加チーム数を計算
    const allTeams = new Set();
    finalMatches.rows.forEach(match => {
      if (match.team1_id) allTeams.add(match.team1_id);
      if (match.team2_id) allTeams.add(match.team2_id);
    });
    
    console.log(`\n👥 総参加チーム: ${allTeams.size}チーム`);
    
    // 順位決定の論理を表示
    console.log('\n🏆 順位決定ルール:');
    console.log('  1位: 決勝戦勝者');
    console.log('  2位: 決勝戦敗者');
    console.log('  3位: 3位決定戦勝者');
    console.log('  4位: 3位決定戦敗者');
    console.log('  5位: 準々決勝敗者 (4チーム)');
    console.log('  9位: Round3敗者 (4チーム)');
    console.log('  17位: Round2敗者 (8チーム)');
    console.log('  25位: Round1敗者 (16チーム)');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
analyzeTournamentStructure();