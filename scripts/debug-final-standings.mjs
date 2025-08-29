import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/**
 * 決勝トーナメント順位表計算のデバッグ
 */
async function debugFinalStandings() {
  try {
    console.log('🔍 決勝トーナメント順位表計算ロジックをデバッグ...');
    
    const tournamentId = 9;
    
    // 1. 決勝トーナメントの試合情報を取得（calculateFinalTournamentStandings と同じクエリ）
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

    console.log(`\n📊 決勝トーナメント試合データ: ${finalMatchesResult.rows.length}件`);

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

    // 2. 各カテゴリの試合を分類
    const finalMatch = finalMatches.find(m => m.match_code === 'M36'); // 決勝戦
    const thirdPlaceMatch = finalMatches.find(m => m.match_code === 'M35'); // 3位決定戦
    const semiFinalMatches = finalMatches.filter(m => ['M33', 'M34'].includes(m.match_code)); // 準決勝
    const quarterFinalMatches = finalMatches.filter(m => ['M29', 'M30', 'M31', 'M32'].includes(m.match_code)); // 準々決勝

    console.log('\n🏆 重要試合の詳細:');
    console.log('  決勝戦 (M36):');
    if (finalMatch) {
      console.log(`    ${finalMatch.team1_display_name} vs ${finalMatch.team2_display_name}`);
      console.log(`    結果: ${finalMatch.team1_scores}-${finalMatch.team2_scores}`);
      console.log(`    勝者: ${finalMatch.winner_team_id} (確定: ${finalMatch.is_confirmed})`);
    } else {
      console.log('    ❌ 見つからない');
    }
    
    console.log('  3位決定戦 (M35):');
    if (thirdPlaceMatch) {
      console.log(`    ${thirdPlaceMatch.team1_display_name} vs ${thirdPlaceMatch.team2_display_name}`);
      console.log(`    結果: ${thirdPlaceMatch.team1_scores}-${thirdPlaceMatch.team2_scores}`);
      console.log(`    勝者: ${thirdPlaceMatch.winner_team_id} (確定: ${thirdPlaceMatch.is_confirmed})`);
    } else {
      console.log('    ❌ 見つからない');
    }
    
    console.log('  準決勝:');
    semiFinalMatches.forEach(match => {
      console.log(`    ${match.match_code}: ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`      結果: ${match.team1_scores}-${match.team2_scores}, 勝者: ${match.winner_team_id} (確定: ${match.is_confirmed})`);
    });

    // 3. 全参加チームIDを取得
    const teamSet = new Set();
    finalMatches.forEach(match => {
      if (match.team1_id) teamSet.add(match.team1_id);
      if (match.team2_id) teamSet.add(match.team2_id);
    });

    console.log(`\n👥 参加チーム: ${teamSet.size}チーム`);
    console.log(`  チームID: ${Array.from(teamSet).join(', ')}`);

    // 4. 順位計算ロジックをステップごとに実行
    const rankings = [];
    const rankedTeamIds = new Set();

    console.log('\n🥇 1位・2位（決勝戦）:');
    if (finalMatch?.is_confirmed && finalMatch.winner_team_id) {
      const winnerId = finalMatch.winner_team_id;
      const loserId = finalMatch.team1_id === winnerId ? finalMatch.team2_id : finalMatch.team1_id;

      console.log(`  優勝: ${winnerId} (${finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name})`);
      console.log(`  準優勝: ${loserId} (${finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name})`);

      rankings.push({
        team_id: winnerId,
        team_name: finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
        position: 1
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          position: 2
        });
        rankedTeamIds.add(loserId);
      }
    } else {
      console.log('  ❌ 決勝戦が未確定または勝者が不明');
    }

    console.log('\n🥉 3位・4位（3位決定戦）:');
    if (thirdPlaceMatch?.is_confirmed && thirdPlaceMatch.winner_team_id) {
      const winnerId = thirdPlaceMatch.winner_team_id;
      const loserId = thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team2_id : thirdPlaceMatch.team1_id;

      console.log(`  3位: ${winnerId} (${thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name})`);
      console.log(`  4位: ${loserId} (${thirdPlaceMatch.team1_id === loserId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name})`);

      rankings.push({
        team_id: winnerId,
        team_name: thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
        position: 3
      });
      rankedTeamIds.add(winnerId);

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: thirdPlaceMatch.team1_id === loserId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
          position: 4
        });
        rankedTeamIds.add(loserId);
      }
    } else {
      console.log('  ❌ 3位決定戦が未確定または勝者が不明');
      
      // 3位決定戦がない場合は準決勝敗者を3位同着
      console.log('  代替: 準決勝敗者を3位同着として処理');
      semiFinalMatches.forEach(match => {
        if (match.is_confirmed && match.winner_team_id) {
          const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
          if (loserId && !rankedTeamIds.has(loserId)) {
            console.log(`    3位: ${loserId} (${match.team1_id === loserId ? match.team1_display_name : match.team2_display_name})`);
            rankings.push({
              team_id: loserId,
              team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
              position: 3
            });
            rankedTeamIds.add(loserId);
          }
        }
      });
    }

    console.log('\n🏅 準々決勝敗者（5位）:');
    quarterFinalMatches.forEach(match => {
      if (match.is_confirmed && match.winner_team_id) {
        const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
        if (loserId && !rankedTeamIds.has(loserId)) {
          console.log(`  5位: ${loserId} (${match.team1_id === loserId ? match.team1_display_name : match.team2_display_name})`);
          rankings.push({
            team_id: loserId,
            team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
            position: 5
          });
          rankedTeamIds.add(loserId);
        }
      }
    });

    console.log('\n📋 最終順位表:');
    rankings.sort((a, b) => a.position - b.position).forEach(team => {
      console.log(`  ${team.position}位: ${team.team_name} (${team.team_id})`);
    });

    console.log('\n🔍 未順位決定チーム:');
    teamSet.forEach(teamId => {
      if (!rankedTeamIds.has(teamId)) {
        console.log(`  未決定: ${teamId}`);
      }
    });

    console.log(`\n📊 集計:`);
    console.log(`  順位決定チーム: ${rankings.length}チーム`);
    console.log(`  未決定チーム: ${teamSet.size - rankings.length}チーム`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
debugFinalStandings();