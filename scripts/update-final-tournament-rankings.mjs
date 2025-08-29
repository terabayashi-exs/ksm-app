import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

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

/**
 * 決勝トーナメントの順位表を手動更新
 */
async function updateFinalTournamentRankings() {
  try {
    console.log('🔄 決勝トーナメント順位表を手動更新...');
    
    const tournamentId = 9;
    
    // calculateFinalTournamentStandings ロジックを再実装
    const finalMatchesResult = await db.execute({
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
        WHERE mb.tournament_id = ? 
          AND mb.phase = 'final'
        ORDER BY ml.match_number, ml.match_code
      `,
      args: [tournamentId]
    });

    const finalMatches = finalMatchesResult.rows.map(row => ({
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

    // 各カテゴリの試合を分類
    const finalMatch = finalMatches.find(m => m.match_code === 'M36');
    const thirdPlaceMatch = finalMatches.find(m => m.match_code === 'M35');
    const semiFinalMatches = finalMatches.filter(m => ['M33', 'M34'].includes(m.match_code));
    const quarterFinalMatches = finalMatches.filter(m => ['M29', 'M30', 'M31', 'M32'].includes(m.match_code));

    // 全参加チームIDを取得
    const teamSet = new Set();
    finalMatches.forEach(match => {
      if (match.team1_id) teamSet.add(match.team1_id);
      if (match.team2_id) teamSet.add(match.team2_id);
    });

    const rankings = [];
    const rankedTeamIds = new Set();

    // 1位・2位（決勝戦）
    if (finalMatch?.is_confirmed && finalMatch.winner_team_id) {
      const winnerId = finalMatch.winner_team_id;
      const loserId = finalMatch.team1_id === winnerId ? finalMatch.team2_id : finalMatch.team1_id;

      rankings.push({
        team_id: winnerId,
        team_name: finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
        team_omission: undefined,
        position: 1,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          team_omission: undefined,
          position: 2,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
        rankedTeamIds.add(loserId);
      }
    }

    // 3位・4位（3位決定戦）
    if (thirdPlaceMatch?.is_confirmed && thirdPlaceMatch.winner_team_id) {
      const winnerId = thirdPlaceMatch.winner_team_id;
      const loserId = thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team2_id : thirdPlaceMatch.team1_id;

      rankings.push({
        team_id: winnerId,
        team_name: thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
        team_omission: undefined,
        position: 3,
        points: 0,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: thirdPlaceMatch.team1_id === loserId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
          team_omission: undefined,
          position: 4,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
        rankedTeamIds.add(loserId);
      }
    }

    // 準々決勝敗者は動的ロジックで処理するため、ここでは何もしない

    // 未確定のチームはトーナメント構造に基づいて順位を決定
    teamSet.forEach(teamId => {
      if (!rankedTeamIds.has(teamId)) {
        const teamMatch = finalMatches.find(m => 
          (m.team1_id === teamId || m.team2_id === teamId)
        );
        const displayName = teamMatch?.team1_id === teamId ? teamMatch.team1_display_name : teamMatch?.team2_display_name;
        
        // トーナメント構造に基づいて順位を動的に決定
        let dynamicPosition = determineTournamentPosition(teamId, finalMatches);
        
        rankings.push({
          team_id: teamId,
          team_name: displayName || '未確定',
          team_omission: undefined,
          position: dynamicPosition,
          points: 0,
          matches_played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goal_difference: 0
        });
      }
    });

    const sortedRankings = rankings.sort((a, b) => a.position - b.position);

    console.log('\n📋 計算された順位表:');
    sortedRankings.filter(r => r.position > 0).forEach(team => {
      console.log(`  ${team.position}位: ${team.team_name} (${team.team_id})`);
    });

    // 決勝トーナメントブロックを取得
    const finalBlockResult = await db.execute({
      sql: `
        SELECT match_block_id 
        FROM t_match_blocks 
        WHERE tournament_id = ? AND phase = 'final'
      `,
      args: [tournamentId]
    });

    if (finalBlockResult.rows.length === 0) {
      console.log('❌ 決勝トーナメントブロックが見つかりません');
      return;
    }

    const finalBlockId = finalBlockResult.rows[0].match_block_id;

    // team_rankingsを更新
    const updateResult = await db.execute({
      sql: `
        UPDATE t_match_blocks 
        SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
        WHERE match_block_id = ?
      `,
      args: [JSON.stringify(sortedRankings), finalBlockId]
    });

    console.log(`\n✅ 決勝トーナメント順位表を更新しました`);
    console.log(`   ブロックID: ${finalBlockId}`);
    console.log(`   更新行数: ${updateResult.rowsAffected}`);
    console.log(`   順位確定チーム: ${sortedRankings.filter(r => r.position > 0).length}チーム`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
updateFinalTournamentRankings();