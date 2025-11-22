// scripts/fix-tournament-74-rankings.mjs
// ID:74の全ブロックの順位表を再計算して修正

import { createClient } from '@libsql/client';

const db = createClient({
  url: 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg'
});

async function fixTournament74Rankings() {
  console.log('=== ID:74 順位表の修正開始 ===\n');

  try {
    // ブロック一覧取得（予選のみ）
    const blocks = await db.execute({
      sql: `
        SELECT match_block_id, block_name
        FROM t_match_blocks
        WHERE tournament_id = ? AND phase = 'preliminary'
        ORDER BY match_block_id
      `,
      args: [74]
    });

    console.log(`対象ブロック: ${blocks.rows.length}件\n`);

    for (const block of blocks.rows) {
      const blockId = block.match_block_id;
      const blockName = block.block_name;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔧 ${blockName}ブロック (ID: ${blockId}) を修正中...`);
      console.log('='.repeat(60));

      // 参加チーム取得
      const teams = await db.execute({
        sql: `
          SELECT DISTINCT tt.team_id, t.team_name, t.team_omission
          FROM t_tournament_teams tt
          JOIN m_teams t ON tt.team_id = t.team_id
          WHERE tt.tournament_id = ? AND tt.assigned_block = ?
        `,
        args: [74, blockName]
      });

      console.log(`参加チーム: ${teams.rows.length}チーム`);

      // 確定試合取得
      const matches = await db.execute({
        sql: `
          SELECT
            mf.team1_id,
            mf.team2_id,
            mf.team1_scores,
            mf.team2_scores,
            mf.winner_team_id,
            mf.is_draw,
            mf.is_walkover
          FROM t_matches_final mf
          LEFT JOIN t_matches_live ml ON mf.match_id = ml.match_id
          WHERE mf.match_block_id = ?
            AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
        `,
        args: [blockId]
      });

      console.log(`確定試合: ${matches.rows.length}件`);

      // 各チームの成績を計算
      const standings = [];

      for (const team of teams.rows) {
        const teamId = String(team.team_id);
        const teamMatches = matches.rows.filter(
          m => String(m.team1_id) === teamId || String(m.team2_id) === teamId
        );

        let wins = 0, draws = 0, losses = 0;
        let goalsFor = 0, goalsAgainst = 0;

        teamMatches.forEach((match) => {
          const isTeam1 = String(match.team1_id) === teamId;
          const teamGoals = isTeam1 ? parseScore(match.team1_scores) : parseScore(match.team2_scores);
          const opponentGoals = isTeam1 ? parseScore(match.team2_scores) : parseScore(match.team1_scores);

          goalsFor += teamGoals;
          goalsAgainst += opponentGoals;

          if (match.is_draw) {
            draws++;
          } else if (String(match.winner_team_id) === teamId) {
            wins++;
          } else {
            losses++;
          }
        });

        const points = wins * 3 + draws * 1;

        standings.push({
          team_id: teamId,
          team_name: team.team_name,
          team_omission: team.team_omission || undefined,
          position: 0, // 後で設定
          points,
          matches_played: teamMatches.length,
          wins,
          draws,
          losses,
          goals_for: goalsFor,
          goals_against: goalsAgainst,
          goal_difference: goalsFor - goalsAgainst
        });
      }

      // 順位を決定
      standings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
        if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
        return a.team_name.localeCompare(b.team_name, 'ja');
      });

      // 順位番号を付与
      standings.forEach((team, index) => {
        team.position = index + 1;
      });

      // team_rankingsを更新
      await db.execute({
        sql: `
          UPDATE t_match_blocks
          SET team_rankings = ?, updated_at = datetime('now', '+9 hours')
          WHERE match_block_id = ?
        `,
        args: [JSON.stringify(standings), blockId]
      });

      console.log('\n✅ 更新後の順位表:');
      standings.forEach((team) => {
        console.log(`  ${team.position}. ${team.team_name}`);
        console.log(`     勝点: ${team.points}, 試合: ${team.matches_played}, 勝: ${team.wins}, 分: ${team.draws}, 敗: ${team.losses}`);
        console.log(`     得点: ${team.goals_for}, 失点: ${team.goals_against}, 得失差: ${team.goal_difference}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 全ブロックの順位表を正常に修正しました');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ エラー発生:', error);
    if (error.stack) {
      console.error('スタックトレース:', error.stack);
    }
  } finally {
    db.close();
  }
}

function parseScore(score) {
  if (score === null || score === undefined) return 0;
  if (typeof score === 'number') return isNaN(score) ? 0 : score;
  if (typeof score === 'string') {
    if (score.trim() === '') return 0;
    if (score.includes(',')) {
      const scores = score.split(',').map(s => parseInt(s.trim()) || 0);
      return scores.reduce((sum, s) => sum + s, 0);
    }
    const parsed = parseInt(score.trim());
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

fixTournament74Rankings();
