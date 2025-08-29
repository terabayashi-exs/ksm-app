import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 動的順位決定ロジックをテスト
 */
async function testDynamicRankings() {
  try {
    console.log('🔍 動的順位決定ロジックをテスト...');
    
    const finalMatches = await db.execute({
      sql: `
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        WHERE mb.tournament_id = 9 
          AND mb.phase = 'final'
        ORDER BY ml.match_number, ml.match_code
      `
    });

    const finalMatchesData = finalMatches.rows.map(row => ({
      match_id: row.match_id,
      match_code: row.match_code,
      team1_id: row.team1_id,
      team2_id: row.team2_id,
      team1_display_name: row.team1_display_name,
      team2_display_name: row.team2_display_name,
      team1_scores: row.team1_scores,
      team2_scores: row.team2_scores,
      winner_team_id: row.winner_team_id,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed)
    }));

    // 全参加チームIDを取得
    const teamSet = new Set();
    finalMatchesData.forEach(match => {
      if (match.team1_id) teamSet.add(match.team1_id);
      if (match.team2_id) teamSet.add(match.team2_id);
    });

    console.log(`\n👥 参加チーム: ${teamSet.size}チーム`);

    // 各チームの動的順位を計算
    const rankings = [];
    teamSet.forEach(teamId => {
      const position = determineTournamentPosition(teamId, finalMatchesData);
      const teamMatch = finalMatchesData.find(m => 
        (m.team1_id === teamId || m.team2_id === teamId)
      );
      const displayName = teamMatch?.team1_id === teamId ? teamMatch.team1_display_name : teamMatch?.team2_display_name;
      
      rankings.push({
        team_id: teamId,
        team_name: displayName,
        position: position
      });
    });

    // 順位別に表示
    rankings.sort((a, b) => {
      if (a.position === b.position) return a.team_name.localeCompare(b.team_name, 'ja');
      return a.position - b.position;
    });

    console.log('\n🏆 動的順位表:');
    let currentPosition = -1;
    let count = 0;
    rankings.forEach(team => {
      if (team.position !== currentPosition) {
        if (currentPosition > 0) {
          console.log(`    ${count}チーム\n`);
        }
        currentPosition = team.position;
        count = 0;
        const positionName = getPositionName(team.position);
        console.log(`  ${team.position}位 (${positionName}):`);
      }
      console.log(`    ${team.team_name} (${team.team_id})`);
      count++;
    });
    console.log(`    ${count}チーム\n`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

function getPositionName(position) {
  switch(position) {
    case 1: return '優勝';
    case 2: return '準優勝';
    case 3: return '3位';
    case 4: return '4位';
    case 5: return '準々決勝敗退';
    case 9: return 'ベスト16';
    case 17: return 'ベスト32';
    case 25: return '1回戦敗退';
    default: return `${position}位`;
  }
}

/**
 * トーナメント構造に基づいてチームの順位を決定する
 */
function determineTournamentPosition(teamId, finalMatches) {
  const teamMatches = finalMatches.filter(m => 
    m.team1_id === teamId || m.team2_id === teamId
  );
  
  if (teamMatches.length === 0) return 25;
  
  // Special case: Check if team won the 3rd place match (M35)
  const thirdPlaceMatch = teamMatches.find(m => m.match_code === 'M35');
  if (thirdPlaceMatch && thirdPlaceMatch.is_confirmed && thirdPlaceMatch.winner_team_id === teamId) {
    return 3;
  }
  
  // Special case: Check if team lost the 3rd place match (M35)  
  if (thirdPlaceMatch && thirdPlaceMatch.is_confirmed && thirdPlaceMatch.winner_team_id && thirdPlaceMatch.winner_team_id !== teamId) {
    return 4;
  }
  
  let lastLossMatch = null;
  for (const match of teamMatches) {
    if (match.is_confirmed && match.winner_team_id && match.winner_team_id !== teamId) {
      const matchNum = parseInt(match.match_code.replace('M', ''));
      if (!lastLossMatch || matchNum > parseInt(lastLossMatch.match_code.replace('M', ''))) {
        lastLossMatch = match;
      }
    }
  }
  
  if (!lastLossMatch) {
    const maxMatchCode = Math.max(...teamMatches.map(m => {
      const match = m.match_code.match(/M(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }));
    
    if (maxMatchCode >= 36) return 1; // 決勝戦勝者
    if (maxMatchCode >= 33) return 5; // 準決勝敗退 (準々決勝で止まった)
    if (maxMatchCode >= 29) return 5; // 準々決勝敗退
    if (maxMatchCode >= 25) return 9; // Round3敗退 (ベスト16)
    if (maxMatchCode >= 17) return 17; // Round2敗退 (ベスト32)
    return 25; // Round1敗退
  }
  
  const lastLossMatchNum = parseInt(lastLossMatch.match_code.replace('M', ''));
  
  if (lastLossMatchNum === 36) return 2; // 決勝戦敗者
  if (lastLossMatchNum >= 33 && lastLossMatchNum <= 34) return 5; // 準決勝敗退 → 準々決勝敗退扱い  
  if (lastLossMatchNum >= 29 && lastLossMatchNum <= 32) return 5; // 準々決勝敗退
  if (lastLossMatchNum >= 25 && lastLossMatchNum <= 28) return 9; // Round3敗退 (ベスト16)
  if (lastLossMatchNum >= 17 && lastLossMatchNum <= 24) return 17; // Round2敗退 (ベスト32)
  if (lastLossMatchNum >= 1 && lastLossMatchNum <= 16) return 25; // Round1敗退
  
  return 25;
}

// 実行
testDynamicRankings();