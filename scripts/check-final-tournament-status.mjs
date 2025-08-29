import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 決勝トーナメントの試合確定状況を詳細チェック
 */
async function checkFinalTournamentStatus() {
  try {
    console.log('🔍 決勝トーナメント試合確定状況チェック...');
    
    // 決勝トーナメントの試合を取得
    const finalMatches = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.team1_id,
          ml.team2_id,
          ml.match_status,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = 9 AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
    });
    
    console.log(`\n📊 決勝トーナメント試合数: ${finalMatches.rows.length}件`);
    
    let confirmedCount = 0;
    let unconfirmedCount = 0;
    
    console.log('\n🎯 試合詳細:');
    finalMatches.rows.forEach(match => {
      const isConfirmed = Boolean(match.is_confirmed);
      const status = isConfirmed ? '✅確定' : '❌未確定';
      
      if (isConfirmed) {
        confirmedCount++;
        const score = match.is_walkover ? '不戦' : `${match.team1_scores}-${match.team2_scores}`;
        const winner = match.is_draw ? '引分' : 
                      match.winner_team_id === match.team1_id ? match.team1_display_name :
                      match.winner_team_id === match.team2_id ? match.team2_display_name : '未定';
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} [${status}] ${score} (勝者: ${winner})`);
      } else {
        unconfirmedCount++;
        console.log(`  ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name} [${status}]`);
      }
    });
    
    console.log(`\n📈 集計:`);
    console.log(`  確定済み: ${confirmedCount}件`);
    console.log(`  未確定: ${unconfirmedCount}件`);
    console.log(`  確定率: ${Math.round(confirmedCount / finalMatches.rows.length * 100)}%`);
    
    // 決勝・3位決定戦・準決勝の状況を特にチェック
    console.log(`\n🏆 重要試合の状況:`);
    const importantMatches = {
      'M36': '決勝戦',
      'M35': '3位決定戦',
      'M33': '準決勝1',
      'M34': '準決勝2'
    };
    
    Object.entries(importantMatches).forEach(([code, description]) => {
      const match = finalMatches.rows.find(m => m.match_code === code);
      if (match) {
        const status = match.is_confirmed ? '✅確定' : '❌未確定';
        console.log(`  ${code} (${description}): ${status}`);
      } else {
        console.log(`  ${code} (${description}): ❓見つからない`);
      }
    });
    
    // 決勝トーナメントのteam_rankingsを確認
    console.log(`\n🎖️ 決勝トーナメント順位表の状況:`);
    const finalBlock = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          team_rankings,
          updated_at
        FROM t_match_blocks 
        WHERE tournament_id = 9 AND phase = 'final'
      `,
    });
    
    if (finalBlock.rows.length > 0) {
      const block = finalBlock.rows[0];
      if (block.team_rankings) {
        try {
          const rankings = JSON.parse(block.team_rankings);
          console.log(`  ✅ 順位表データあり (${rankings.length}チーム)`);
          console.log(`  📅 最終更新: ${block.updated_at}`);
          
          rankings.forEach(team => {
            console.log(`    ${team.position}位: ${team.team_name} (position: ${team.position})`);
          });
        } catch (parseError) {
          console.log(`  ❌ 順位表データのパースエラー: ${parseError.message}`);
        }
      } else {
        console.log(`  ❌ 順位表データなし`);
      }
    } else {
      console.log(`  ❌ 決勝トーナメントブロックが見つからない`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkFinalTournamentStatus();