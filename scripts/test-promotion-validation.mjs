// scripts/test-promotion-validation.mjs
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

// 本番データベースに接続
const db = createClient({
  url: 'libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg',
});

// tournament-promotion.tsの関数を模擬実装
async function getAllBlockRankings(tournamentId) {
  const sql = `
    SELECT
      match_block_id,
      block_name,
      team_rankings
    FROM t_match_blocks
    WHERE tournament_id = ?
    AND phase = 'preliminary'
    AND team_rankings IS NOT NULL
    ORDER BY block_name
  `;

  const blocks = await db.execute({
    sql,
    args: [tournamentId]
  });

  const blockRankings = [];

  for (const block of blocks.rows) {
    if (block.team_rankings) {
      try {
        const rankings = JSON.parse(block.team_rankings);
        blockRankings.push({
          block_name: block.block_name,
          rankings: rankings
        });
      } catch (parseError) {
        console.error(`ブロック ${block.block_name} の順位表パースエラー:`, parseError);
      }
    }
  }

  return blockRankings;
}

async function extractTopTeamsDynamic(tournamentId, blockRankings) {
  const promotions = {};

  try {
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const formatId = formatResult.rows[0].format_id;

    const templateResult = await db.execute({
      sql: `
        SELECT DISTINCT team1_source, team2_source
        FROM m_match_templates
        WHERE format_id = ? AND phase = 'final'
      `,
      args: [formatId]
    });

    const requiredPromotions = new Set();
    templateResult.rows.forEach(row => {
      const team1Source = row.team1_source;
      const team2Source = row.team2_source;

      if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
        requiredPromotions.add(team1Source);
      }
      if (team2Source && team2Source.match(/^[A-Z]_\d+$/)) {
        requiredPromotions.add(team2Source);
      }
    });

    console.log(`必要な進出条件:`, Array.from(requiredPromotions));

    blockRankings.forEach(block => {
      const rankings = block.rankings;

      const blockPromotions = Array.from(requiredPromotions).filter(key => key.startsWith(`${block.block_name}_`));

      blockPromotions.forEach(promotionKey => {
        const [, positionStr] = promotionKey.split('_');
        const position = parseInt(positionStr);

        if (!isNaN(position)) {
          const teamsAtPosition = rankings.filter(team => team.position === position);

          if (teamsAtPosition.length > 0) {
            const selectedTeam = teamsAtPosition[0];
            promotions[promotionKey] = {
              team_id: selectedTeam.team_id,
              team_name: selectedTeam.team_name || selectedTeam.team_omission || selectedTeam.team_id
            };
          }
        }
      });
    });

    return promotions;

  } catch (error) {
    console.error(`動的進出チーム抽出エラー:`, error);
    return {};
  }
}

async function validateFinalTournamentPromotions(tournamentId) {
  const issues = [];

  try {
    console.log(`\n=== 決勝トーナメント進出条件チェック開始: Tournament ${tournamentId} ===`);

    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (formatResult.rows.length === 0) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }

    const formatId = formatResult.rows[0].format_id;

    const blockRankings = await getAllBlockRankings(tournamentId);
    const promotions = await extractTopTeamsDynamic(tournamentId, blockRankings);

    console.log(`進出チーム情報取得完了: ${Object.keys(promotions).length}件`);
    console.log('進出チーム一覧:');
    Object.entries(promotions).forEach(([key, team]) => {
      console.log(`  ${key}: ${team.team_name} (${team.team_id})`);
    });

    const matchesResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          mt.team1_source,
          mt.team2_source,
          mt.team1_display_name as template_team1_display,
          mt.team2_display_name as template_team2_display,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mt ON mt.match_code = ml.match_code AND mt.format_id = ?
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
        ORDER BY ml.match_code
      `,
      args: [formatId, tournamentId]
    });

    console.log(`\n決勝トーナメント試合: ${matchesResult.rows.length}件`);

    for (const match of matchesResult.rows) {
      const matchId = match.match_id;
      const matchCode = match.match_code;
      const team1Id = match.team1_id;
      const team2Id = match.team2_id;
      const team1DisplayName = match.team1_display_name;
      const team2DisplayName = match.team2_display_name;
      const team1Source = match.team1_source;
      const team2Source = match.team2_source;
      const templateTeam1Display = match.template_team1_display;
      const templateTeam2Display = match.template_team2_display;
      const isConfirmed = Boolean(match.is_confirmed);

      // team1のチェック
      if (team1Source && team1Source.match(/^[A-Z]_\d+$/)) {
        const expectedTeam = promotions[team1Source];

        if (expectedTeam) {
          if (team1Id !== expectedTeam.team_id) {
            const isPlaceholder = team1DisplayName === templateTeam1Display;

            issues.push({
              match_code: matchCode,
              match_id: matchId,
              position: 'team1',
              expected_source: team1Source,
              expected_team_id: expectedTeam.team_id,
              expected_team_name: expectedTeam.team_name,
              current_team_id: team1Id,
              current_team_name: team1DisplayName,
              is_placeholder: isPlaceholder,
              severity: isConfirmed ? 'error' : 'warning',
              message: isPlaceholder
                ? `team1がプレースホルダー表記のまま: "${team1DisplayName}" → 正しくは "${expectedTeam.team_name}"`
                : `team1が誤設定: "${team1DisplayName}" → 正しくは "${expectedTeam.team_name}"`
            });

            console.log(`⚠️  ${matchCode} team1: "${team1DisplayName}" → 期待値 "${expectedTeam.team_name}"`);
          }
        }
      }

      // team2のチェック
      if (team2Source && team2Source.match(/^[A-Z]_\d+$/)) {
        const expectedTeam = promotions[team2Source];

        if (expectedTeam) {
          if (team2Id !== expectedTeam.team_id) {
            const isPlaceholder = team2DisplayName === templateTeam2Display;

            issues.push({
              match_code: matchCode,
              match_id: matchId,
              position: 'team2',
              expected_source: team2Source,
              expected_team_id: expectedTeam.team_id,
              expected_team_name: expectedTeam.team_name,
              current_team_id: team2Id,
              current_team_name: team2DisplayName,
              is_placeholder: isPlaceholder,
              severity: isConfirmed ? 'error' : 'warning',
              message: isPlaceholder
                ? `team2がプレースホルダー表記のまま: "${team2DisplayName}" → 正しくは "${expectedTeam.team_name}"`
                : `team2が誤設定: "${team2DisplayName}" → 正しくは "${expectedTeam.team_name}"`
            });

            console.log(`⚠️  ${matchCode} team2: "${team2DisplayName}" → 期待値 "${expectedTeam.team_name}"`);
          }
        }
      }
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const placeholderCount = issues.filter(i => i.is_placeholder).length;

    const result = {
      isValid: issues.length === 0,
      totalMatches: matchesResult.rows.length,
      checkedMatches: matchesResult.rows.length,
      issues,
      summary: {
        errorCount,
        warningCount,
        placeholderCount
      }
    };

    console.log(`\nチェック完了: ${result.isValid ? '✅ 正常' : '⚠️ 問題あり'}`);
    console.log(`エラー: ${errorCount}件、警告: ${warningCount}件、プレースホルダー残存: ${placeholderCount}件`);

    return result;

  } catch (error) {
    console.error(`チェック処理エラー:`, error);
    return {
      isValid: false,
      totalMatches: 0,
      checkedMatches: 0,
      issues,
      summary: {
        errorCount: 0,
        warningCount: 0,
        placeholderCount: 0
      }
    };
  }
}

async function testPromotionValidation() {
  try {
    const tournamentId = 75;

    const result = await validateFinalTournamentPromotions(tournamentId);

    console.log('\n=== 検証結果詳細 ===');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('テストエラー:', error);
  } finally {
    db.close();
  }
}

testPromotionValidation();
