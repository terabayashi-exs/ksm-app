// scripts/check-prod-tournament-74.mjs
// 本番環境のID:74の試合データと順位計算を詳細に検証

import { createClient } from '@libsql/client';

// 本番環境の接続情報（CLAUDE.mdから）
const db = createClient({
  url: 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg'
});

async function checkProdTournament74() {
  console.log('=== 本番環境 ID:74 順位計算問題の詳細診断 ===\n');

  try {
    // 1. 大会情報
    const tournament = await db.execute({
      sql: 'SELECT tournament_id, tournament_name FROM t_tournaments WHERE tournament_id = ?',
      args: [74]
    });

    if (tournament.rows.length === 0) {
      console.log('❌ ID:74の大会が見つかりません');
      return;
    }

    console.log(`📊 大会: ${tournament.rows[0].tournament_name}\n`);

    // 2. ブロック一覧
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

      console.log(`\n${'='.repeat(70)}`);
      console.log(`🎯 ブロック: ${blockName} (ID: ${blockId}, Phase: ${phase})`);
      console.log('='.repeat(70));

      // 3. 参加チーム
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
        console.log(`  ${i + 1}. ${team.team_name} (ID: ${team.team_id}, 型: ${typeof team.team_id})`);
      });

      // 4. 確定済み試合数（重要！）
      const matchCount = await db.execute({
        sql: `
          SELECT COUNT(*) as count
          FROM t_matches_final mf
          LEFT JOIN t_matches_live ml ON mf.match_id = ml.match_id
          WHERE mf.match_block_id = ?
            AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
        `,
        args: [blockId]
      });

      const confirmedCount = Number(matchCount.rows[0].count);
      const expectedCount = (teams.rows.length * (teams.rows.length - 1)) / 2; // リーグ戦の総試合数

      console.log(`\n✅ 確定済み試合: ${confirmedCount}件`);
      console.log(`📊 期待される試合数: ${expectedCount}件 (${teams.rows.length}チームの総当たり)`);

      if (confirmedCount < expectedCount) {
        console.log(`⚠️  警告: ${expectedCount - confirmedCount}件の試合が確定されていません！`);
      }

      // 5. 確定済み試合の詳細
      const matches = await db.execute({
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
            tw.team_name as winner_name,
            typeof(mf.team1_id) as team1_id_type,
            typeof(mf.team2_id) as team2_id_type
          FROM t_matches_final mf
          JOIN t_matches_live ml ON mf.match_id = ml.match_id
          LEFT JOIN m_teams t1 ON mf.team1_id = t1.team_id
          LEFT JOIN m_teams t2 ON mf.team2_id = t2.team_id
          LEFT JOIN m_teams tw ON mf.winner_team_id = tw.team_id
          WHERE mf.match_block_id = ?
            AND (ml.match_status IS NULL OR ml.match_status != 'cancelled')
          ORDER BY ml.match_code
        `,
        args: [blockId]
      });

      console.log(`\n📋 確定済み試合の詳細:`);
      matches.rows.forEach((match) => {
        const score1 = parseScore(match.team1_scores);
        const score2 = parseScore(match.team2_scores);
        const result = match.is_draw ? '引き分け' : `${match.winner_name}の勝利`;

        console.log(`  ${match.match_code}: ${match.team1_name} ${score1}-${score2} ${match.team2_name}`);
        console.log(`    結果: ${result}`);
        console.log(`    team_id型: team1=${match.team1_id_type}, team2=${match.team2_id_type}`);
      });

      // 6. 各チームの手動計算
      console.log(`\n📈 各チームの成績（手動計算）:`);

      for (const team of teams.rows) {
        const teamId = team.team_id;
        const teamName = team.team_name;

        // このチームが関わる試合
        const teamMatches = matches.rows.filter(
          m => String(m.team1_id) === String(teamId) || String(m.team2_id) === String(teamId)
        );

        console.log(`\n  【${teamName}】`);
        console.log(`    関連試合数: ${teamMatches.length}件`);

        if (teamMatches.length === 0) {
          console.log(`    ⚠️  このチームの試合が1件も見つかりません！`);
          console.log(`    デバッグ情報:`);
          console.log(`      - チームID: ${teamId} (型: ${typeof teamId})`);
          console.log(`      - 試合データのteam_id型: ${matches.rows[0]?.team1_id_type}`);
          continue;
        }

        let wins = 0, draws = 0, losses = 0;
        let goalsFor = 0, goalsAgainst = 0;

        teamMatches.forEach((match) => {
          const isTeam1 = String(match.team1_id) === String(teamId);
          const teamGoals = isTeam1 ? parseScore(match.team1_scores) : parseScore(match.team2_scores);
          const opponentGoals = isTeam1 ? parseScore(match.team2_scores) : parseScore(match.team1_scores);

          goalsFor += teamGoals;
          goalsAgainst += opponentGoals;

          if (match.is_draw) {
            draws++;
          } else if (String(match.winner_team_id) === String(teamId)) {
            wins++;
          } else {
            losses++;
          }
        });

        const points = wins * 3 + draws * 1;

        console.log(`    試合: ${teamMatches.length}, 勝: ${wins}, 分: ${draws}, 敗: ${losses}`);
        console.log(`    得点: ${goalsFor}, 失点: ${goalsAgainst}, 得失差: ${goalsFor - goalsAgainst}`);
        console.log(`    勝点: ${points}点`);

        // 問題チェック
        if (teamMatches.length > 0 && teamMatches.length < teams.rows.length - 1) {
          console.log(`    ⚠️  警告: このチームの試合が不足しています（${teams.rows.length - 1 - teamMatches.length}件不足）`);
        }
      }

      // 7. 保存されている順位表
      const savedRankings = await db.execute({
        sql: 'SELECT team_rankings FROM t_match_blocks WHERE match_block_id = ?',
        args: [blockId]
      });

      if (savedRankings.rows[0]?.team_rankings) {
        console.log(`\n💾 保存されている順位表 (team_rankings):`);
        try {
          const rankings = JSON.parse(savedRankings.rows[0].team_rankings);
          rankings.forEach((team) => {
            console.log(`  ${team.position}. ${team.team_name}`);
            console.log(`     勝点: ${team.points}, 試合: ${team.matches_played}, 勝: ${team.wins}, 分: ${team.draws}, 敗: ${team.losses}`);
            console.log(`     得点: ${team.goals_for}, 失点: ${team.goals_against}, 得失差: ${team.goal_difference}`);

            // 勝点の検証
            const expectedPoints = team.wins * 3 + team.draws * 1;
            if (team.points !== expectedPoints) {
              console.log(`     ❌ 勝点エラー: 計算値=${expectedPoints}, 保存値=${team.points}`);
            }
          });
        } catch (e) {
          console.log(`  ❌ JSONパースエラー: ${e.message}`);
        }
      } else {
        console.log(`\n⚠️  team_rankingsが空です`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ 診断完了');
    console.log('='.repeat(70));

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

checkProdTournament74();
