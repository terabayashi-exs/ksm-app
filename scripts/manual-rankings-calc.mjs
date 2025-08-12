#!/usr/bin/env node

// Manual rankings calculation
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// Simplified version of calculateBlockStandings
async function calculateBlockStandings(matchBlockId, tournamentId) {
  try {
    console.log(`🔄 Calculating standings for block ${matchBlockId} in tournament ${tournamentId}...`);
    
    // Get teams in this block
    const teamsResult = await client.execute(`
      SELECT DISTINCT
        tt.team_id,
        t.team_name,
        t.team_omission
      FROM t_tournament_teams tt
      JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ?
      AND tt.assigned_block = (
        SELECT block_name 
        FROM t_match_blocks 
        WHERE match_block_id = ?
      )
      ORDER BY t.team_name
    `, [tournamentId, matchBlockId]);

    console.log(`👥 Found ${teamsResult.rows.length} teams assigned to this block`);
    
    if (teamsResult.rows.length === 0) {
      console.log('⚠️  No teams assigned to block. Checking matches to find teams...');
      
      // Get teams from matches instead
      const matchTeamsResult = await client.execute(`
        SELECT DISTINCT team1_id as team_id
        FROM t_matches_final 
        WHERE match_block_id = ? AND team1_id IS NOT NULL
        UNION
        SELECT DISTINCT team2_id as team_id
        FROM t_matches_final 
        WHERE match_block_id = ? AND team2_id IS NOT NULL
      `, [matchBlockId, matchBlockId]);
      
      console.log(`👥 Found ${matchTeamsResult.rows.length} teams from matches`);
      
      // Get team names
      const teamIds = matchTeamsResult.rows.map(row => row.team_id);
      if (teamIds.length === 0) {
        console.log('❌ No teams found in matches either');
        return [];
      }
      
      const placeholders = teamIds.map(() => '?').join(',');
      const teamNamesResult = await client.execute(`
        SELECT team_id, team_name, team_omission
        FROM m_teams
        WHERE team_id IN (${placeholders})
      `, teamIds);
      
      teamsResult.rows = teamNamesResult.rows;
    }

    // Get confirmed match results
    const matchesResult = await client.execute(`
      SELECT 
        match_id,
        match_block_id,
        team1_id,
        team2_id,
        team1_scores,
        team2_scores,
        winner_team_id,
        CASE WHEN winner_team_id IS NULL THEN 1 ELSE 0 END as is_draw,
        0 as is_walkover
      FROM t_matches_final
      WHERE match_block_id = ?
      AND (team1_id IS NOT NULL AND team2_id IS NOT NULL)
    `, [matchBlockId]);

    console.log(`⚽ Found ${matchesResult.rows.length} confirmed matches`);

    const matches = matchesResult.rows.map(row => ({
      match_id: row.match_id,
      match_block_id: row.match_block_id,
      team1_id: row.team1_id,
      team2_id: row.team2_id,
      team1_goals: Number(row.team1_scores) || 0,
      team2_goals: Number(row.team2_scores) || 0,
      winner_team_id: row.winner_team_id,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover)
    }));

    // Get tournament settings
    const tournamentResult = await client.execute(`
      SELECT 
        win_points, 
        draw_points, 
        loss_points
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    const winPoints = tournamentResult.rows?.[0]?.win_points || 3;
    const drawPoints = tournamentResult.rows?.[0]?.draw_points || 1;
    const lossPoints = tournamentResult.rows?.[0]?.loss_points || 0;

    console.log(`⚙️  Point system: Win=${winPoints}, Draw=${drawPoints}, Loss=${lossPoints}`);

    // Calculate each team's standings
    const teamStandings = teamsResult.rows.map(team => {
      const teamId = team.team_id;
      
      // Find matches for this team
      const teamMatches = matches.filter(match => 
        match.team1_id === teamId || match.team2_id === teamId
      );

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let points = 0;

      teamMatches.forEach(match => {
        const isTeam1 = match.team1_id === teamId;
        const teamGoals = isTeam1 ? match.team1_goals : match.team2_goals;
        const opponentGoals = isTeam1 ? match.team2_goals : match.team1_goals;

        goalsFor += teamGoals;
        goalsAgainst += opponentGoals;

        if (match.is_draw) {
          draws++;
          points += drawPoints;
        } else if (match.winner_team_id === teamId) {
          wins++;
          points += winPoints;
        } else {
          losses++;
          points += lossPoints;
        }
      });

      return {
        team_id: teamId,
        team_name: team.team_name,
        team_omission: team.team_omission || undefined,
        position: 0, // Will be set later
        points,
        matches_played: teamMatches.length,
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst
      };
    });

    // Sort by points, then goal difference, then goals for
    teamStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    // Set positions
    teamStandings.forEach((team, index) => {
      team.position = index + 1;
    });

    return teamStandings;
  } catch (error) {
    console.error('❌ Error calculating standings:', error);
    throw error;
  }
}

async function updateBlockRankings() {
  try {
    const standings = await calculateBlockStandings(14, 3);
    
    console.log('\n📊 Calculated standings:');
    standings.forEach(team => {
      console.log(`  ${team.position}. ${team.team_name} - ${team.points}pts (${team.wins}W ${team.draws}D ${team.losses}L) GD:${team.goal_difference}`);
    });

    // Update the database
    await client.execute(`
      UPDATE t_match_blocks 
      SET team_rankings = ?, updated_at = datetime('now', '+9 hours') 
      WHERE match_block_id = ?
    `, [JSON.stringify(standings), 14]);

    console.log('\n✅ Rankings updated in database');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.close();
  }
}

updateBlockRankings();