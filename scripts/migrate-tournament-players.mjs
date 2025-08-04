import { createClient } from "@libsql/client";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function addTournamentPlayersTable() {
  try {
    console.log('Creating t_tournament_players table...');
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS t_tournament_players (
        tournament_player_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        jersey_number INTEGER NOT NULL,
        player_status TEXT NOT NULL DEFAULT 'active',
        registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        withdrawal_date DATETIME,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tournament_id) REFERENCES t_tournaments(tournament_id),
        FOREIGN KEY (team_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (player_id) REFERENCES m_players(player_id),
        UNIQUE(tournament_id, team_id, jersey_number),
        UNIQUE(tournament_id, team_id, player_id)
      )
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_team 
      ON t_tournament_players(tournament_id, team_id)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_player 
      ON t_tournament_players(player_id)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tournament_players_status 
      ON t_tournament_players(player_status)
    `);

    console.log('✅ t_tournament_players table created successfully');
  } catch (error) {
    console.error('❌ Error creating table:', error);
  } finally {
    db.close();
  }
}

addTournamentPlayersTable();