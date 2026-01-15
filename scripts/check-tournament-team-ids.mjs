import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function checkTournamentTeamIds(tournamentId) {
  console.log(`\n=== 大会 ${tournamentId} のtournament_team_id整合性チェック ===\n`);

  // 1. t_tournament_teams のtournament_team_idを取得
  const teamsResult = await db.execute(`
    SELECT tournament_team_id, team_id, team_name
    FROM t_tournament_teams
    WHERE tournament_id = ?
    ORDER BY tournament_team_id
  `, [tournamentId]);

  console.log(`✓ t_tournament_teams: ${teamsResult.rows.length}チーム`);
  const validTournamentTeamIds = new Set(
    teamsResult.rows.map(row => Number(row.tournament_team_id))
  );
  console.log(`有効なtournament_team_id: ${Array.from(validTournamentTeamIds).join(', ')}\n`);

  // 2. t_matches_live のtournament_team_idをチェック
  const liveMatchesResult = await db.execute(`
    SELECT
      ml.match_id,
      ml.match_code,
      ml.team1_tournament_team_id,
      ml.team2_tournament_team_id,
      ml.team1_display_name,
      ml.team2_display_name
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
      AND (ml.team1_tournament_team_id IS NOT NULL OR ml.team2_tournament_team_id IS NOT NULL)
    ORDER BY ml.match_code
  `, [tournamentId]);

  console.log(`✓ t_matches_live: ${liveMatchesResult.rows.length}試合（チーム割り当て済み）`);

  let liveInvalidCount = 0;
  for (const row of liveMatchesResult.rows) {
    const team1Id = row.team1_tournament_team_id ? Number(row.team1_tournament_team_id) : null;
    const team2Id = row.team2_tournament_team_id ? Number(row.team2_tournament_team_id) : null;

    const team1Valid = team1Id === null || validTournamentTeamIds.has(team1Id);
    const team2Valid = team2Id === null || validTournamentTeamIds.has(team2Id);

    if (!team1Valid || !team2Valid) {
      liveInvalidCount++;
      console.log(`  ❌ ${row.match_code}: team1_tournament_team_id=${team1Id} (${team1Valid ? 'OK' : 'NG'}), team2_tournament_team_id=${team2Id} (${team2Valid ? 'OK' : 'NG'})`);
    }
  }

  if (liveInvalidCount === 0) {
    console.log(`  ✅ 全ての試合のtournament_team_idが有効です\n`);
  } else {
    console.log(`  ⚠️  ${liveInvalidCount}件の不整合が見つかりました\n`);
  }

  // 3. t_matches_final のtournament_team_idをチェック
  const finalMatchesResult = await db.execute(`
    SELECT
      mf.match_id,
      mf.match_code,
      mf.team1_tournament_team_id,
      mf.team2_tournament_team_id,
      mf.winner_tournament_team_id,
      mf.team1_display_name,
      mf.team2_display_name
    FROM t_matches_final mf
    JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
    ORDER BY mf.match_code
  `, [tournamentId]);

  console.log(`✓ t_matches_final: ${finalMatchesResult.rows.length}試合（確定済み）`);

  let finalInvalidCount = 0;
  for (const row of finalMatchesResult.rows) {
    const team1Id = row.team1_tournament_team_id ? Number(row.team1_tournament_team_id) : null;
    const team2Id = row.team2_tournament_team_id ? Number(row.team2_tournament_team_id) : null;
    const winnerId = row.winner_tournament_team_id ? Number(row.winner_tournament_team_id) : null;

    const team1Valid = team1Id === null || validTournamentTeamIds.has(team1Id);
    const team2Valid = team2Id === null || validTournamentTeamIds.has(team2Id);
    const winnerValid = winnerId === null || validTournamentTeamIds.has(winnerId);

    if (!team1Valid || !team2Valid || !winnerValid) {
      finalInvalidCount++;
      console.log(`  ❌ ${row.match_code}:`);
      console.log(`     team1_tournament_team_id=${team1Id} (${team1Valid ? 'OK' : 'NG'})`);
      console.log(`     team2_tournament_team_id=${team2Id} (${team2Valid ? 'OK' : 'NG'})`);
      console.log(`     winner_tournament_team_id=${winnerId} (${winnerValid ? 'OK' : 'NG'})`);
    }
  }

  if (finalInvalidCount === 0) {
    console.log(`  ✅ 全ての確定済み試合のtournament_team_idが有効です\n`);
  } else {
    console.log(`  ⚠️  ${finalInvalidCount}件の不整合が見つかりました\n`);
  }

  // 4. 総合結果
  if (liveInvalidCount === 0 && finalInvalidCount === 0) {
    console.log(`\n🎉 大会${tournamentId}のtournament_team_id整合性: 完璧です！\n`);
  } else {
    console.log(`\n⚠️  大会${tournamentId}のtournament_team_id整合性: 問題があります\n`);
  }
}

// コマンドライン引数から大会IDを取得
const tournamentId = process.argv[2];
if (!tournamentId) {
  console.error('使用方法: node scripts/check-tournament-team-ids.mjs <tournament_id>');
  process.exit(1);
}

checkTournamentTeamIds(parseInt(tournamentId))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
