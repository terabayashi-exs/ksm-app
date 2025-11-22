// scripts/check-tournament-74-standings.mjs
// 本番環境のID:74の部門の試合データと順位計算を検証するスクリプト

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || ''
});

async function checkTournament74Standings() {
  console.log('=== 本番環境 ID:74 大会の順位計算検証 ===\n');

  try {
    // 1. 大会情報を取得
    const tournamentInfo = await db.execute({
      sql: 'SELECT tournament_id, tournament_name FROM t_tournaments WHERE tournament_id = ?',
      args: [74]
    });

    if (tournamentInfo.rows.length === 0) {
      console.log('⚠️ ID:74の大会が見つかりません');
      return;
    }

    console.log(`📊 大会名: ${tournamentInfo.rows[0].tournament_name}\n`);

    // 2. ブロック情報を取得
    const blocks = await db.execute({
      sql: `
        SELECT match_block_id, phase, block_name, display_round_name
        FROM t_match_blocks
        WHERE tournament_id = ?
        ORDER BY match_block_id
      `,
      args: [74]
    });

    console.log(`📦 ブロック数: ${blocks.rows.length}件\n`);

    for (const block of blocks.rows) {
      const blockId = block.match_block_id;
      const blockName = block.block_name;
      const phase = block.phase;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎯 ブロック: ${blockName} (ID: ${blockId}, Phase: ${phase})`);
      console.log('='.repeat(60));

      // 3. 参加チーム一覧
      const teams = await db.execute({
        sql: `
          SELECT DISTINCT tt.team_id, t.team_name
          FROM t_tournament_teams tt
          JOIN m_teams t ON tt.team_id = t.team_id
          WHERE tt.tournament_id = ? AND tt.assigned_block = ?
        `,
        args: [74, blockName]
      });

      console.log(`\n👥 参加チーム: ${teams.rows.length}チーム`);
      teams.rows.forEach((team, i) => {
        console.log(`  ${i + 1}. ${team.team_name} (${team.team_id})`);
      });

      // 4. 確定済み試合（t_matches_final）の確認
      const confirmedMatches = await db.execute({
        sql: `
          SELECT
            mf.match_id,
            ml.match_code,
            mf.team1_id,
            mf.team2_id,
            t1.team_name as team1_name,
            t2.team_name as team2_name,
            mf.team1_scores,
            mf.team2_scores,
            mf.winner_team_id,
            mf.is_draw,
            tw.team_name as winner_name
          FROM t_matches_final mf
          JOIN t_matches_live ml ON mf.match_id = ml.match_id
          LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
          LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
          LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
          WHERE mf.match_block_id = ?
            AND ml.match_status != 'cancelled'
          ORDER BY ml.match_code
        `,
        args: [blockId]
      });

      console.log(`\n✅ 確定済み試合: ${confirmedMatches.rows.length}件`);
      confirmedMatches.rows.forEach((match) => {
        const score1 = parseScore(match.team1_scores);
        const score2 = parseScore(match.team2_scores);
        const result = match.is_draw
          ? '引き分け'
          : `${match.winner_name}の勝利`;

        console.log(`  ${match.match_code}: ${match.team1_name} ${score1}-${score2} ${match.team2_name} (${result})`);
      });

      // 5. 各チームの成績を手動計算
      console.log(`\n📈 手動計算による成績:`);

      for (const team of teams.rows) {
        const teamId = team.team_id;
        const teamName = team.team_name;

        // このチームが関わる試合を抽出
        const teamMatches = confirmedMatches.rows.filter(
          match => match.team1_id === teamId || match.team2_id === teamId
        );

        let wins = 0;
        let draws = 0;
        let losses = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;
        let points = 0;

        teamMatches.forEach((match) => {
          const isTeam1 = match.team1_id === teamId;
          const teamGoals = isTeam1 ? parseScore(match.team1_scores) : parseScore(match.team2_scores);
          const opponentGoals = isTeam1 ? parseScore(match.team2_scores) : parseScore(match.team1_scores);

          goalsFor += teamGoals;
          goalsAgainst += opponentGoals;

          if (match.is_draw) {
            draws++;
            points += 1; // 引き分けは1点
          } else if (match.winner_team_id === teamId) {
            wins++;
            points += 3; // 勝利は3点
          } else {
            losses++;
            // 敗北は0点
          }
        });

        console.log(`  ${teamName}:`);
        console.log(`    試合数: ${teamMatches.length}, 勝: ${wins}, 分: ${draws}, 敗: ${losses}`);
        console.log(`    得点: ${goalsFor}, 失点: ${goalsAgainst}, 得失差: ${goalsFor - goalsAgainst}`);
        console.log(`    勝点: ${points}点 (期待値: 勝${wins}×3 + 分${draws}×1 = ${wins * 3 + draws * 1})`);

        // 問題チェック
        if (teamMatches.length > 0 && points !== (wins * 3 + draws * 1)) {
          console.log(`    ⚠️ 勝点計算に問題があります!`);
        }
      }

      // 6. team_rankingsに保存されている順位表を確認
      const blockData = await db.execute({
        sql: 'SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?',
        args: [blockId]
      });

      if (blockData.rows[0]?.team_rankings) {
        console.log(`\n💾 保存されている順位表 (team_rankings):`);
        const savedRankings = JSON.parse(blockData.rows[0].team_rankings);
        savedRankings.forEach((team) => {
          console.log(`  ${team.position}. ${team.team_name}`);
          console.log(`     勝点: ${team.points}, 試合: ${team.matches_played}, 勝: ${team.wins}, 分: ${team.draws}, 敗: ${team.losses}`);
          console.log(`     得点: ${team.goals_for}, 失点: ${team.goals_against}, 得失差: ${team.goal_difference}`);
        });
      } else {
        console.log(`\n⚠️ team_rankingsにデータが保存されていません`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('検証完了');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

// スコア文字列をパース（カンマ区切り対応）
function parseScore(score) {
  if (score === null || score === undefined) {
    return 0;
  }

  if (typeof score === 'number') {
    return isNaN(score) ? 0 : score;
  }

  if (typeof score === 'string') {
    if (score.trim() === '') {
      return 0;
    }

    // カンマ区切りの場合は合計
    if (score.includes(',')) {
      const scores = score.split(',').map(s => parseInt(s.trim()) || 0);
      return scores.reduce((sum, s) => sum + s, 0);
    }

    const parsed = parseInt(score.trim());
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

checkTournament74Standings();
