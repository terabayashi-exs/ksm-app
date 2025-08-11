// Fix t_matches_final table structure
// Remove confirmed_at column and add updated_at column

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixMatchesFinalTable() {
  try {
    console.log('Starting t_matches_final table structure fix...');

    // Step 1: Check current structure
    console.log('\n1. Checking current table structure...');
    const currentStructure = await client.execute('PRAGMA table_info(t_matches_final)');
    const currentColumns = currentStructure.rows.map(row => row.name);
    console.log('Current columns:', currentColumns.join(', '));

    // Step 2: Create new table with correct structure
    console.log('\n2. Creating new table with correct structure...');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS t_matches_final_new (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_block_id INTEGER NOT NULL,
        tournament_date TEXT NOT NULL,
        match_number INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        team1_id TEXT,
        team2_id TEXT,
        team1_display_name TEXT NOT NULL,
        team2_display_name TEXT NOT NULL,
        court_number INTEGER,
        start_time TEXT,
        team1_scores TEXT,
        team2_scores TEXT,
        period_count INTEGER NOT NULL DEFAULT 1,
        winner_team_id TEXT,
        is_draw INTEGER NOT NULL DEFAULT 0,
        is_walkover INTEGER NOT NULL DEFAULT 0,
        match_status TEXT NOT NULL DEFAULT 'completed',
        result_status TEXT NOT NULL DEFAULT 'confirmed',
        remarks TEXT,
        created_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        updated_at DATETIME DEFAULT (datetime('now', '+9 hours')),
        FOREIGN KEY (match_block_id) REFERENCES t_match_blocks(match_block_id),
        FOREIGN KEY (team1_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (team2_id) REFERENCES m_teams(team_id),
        FOREIGN KEY (winner_team_id) REFERENCES m_teams(team_id)
      )
    `);

    // Step 3: Copy data from old table to new table (excluding confirmed_at)
    console.log('\n3. Copying data from old table to new table...');
    await client.execute(`
      INSERT INTO t_matches_final_new (
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, period_count,
        winner_team_id, is_draw, is_walkover, match_status, result_status,
        remarks, created_at, updated_at
      )
      SELECT 
        match_id, match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, team1_scores, team2_scores, period_count,
        winner_team_id, is_draw, is_walkover, match_status, result_status,
        remarks, created_at, datetime('now', '+9 hours') as updated_at
      FROM t_matches_final
    `);

    // Step 4: Count records
    const oldCount = await client.execute('SELECT COUNT(*) as count FROM t_matches_final');
    const newCount = await client.execute('SELECT COUNT(*) as count FROM t_matches_final_new');
    console.log(`Old table records: ${oldCount.rows[0].count}`);
    console.log(`New table records: ${newCount.rows[0].count}`);

    if (oldCount.rows[0].count === newCount.rows[0].count) {
      // Step 5: Drop old table and rename new table
      console.log('\n4. Replacing old table with new table...');
      await client.execute('DROP TABLE t_matches_final');
      await client.execute('ALTER TABLE t_matches_final_new RENAME TO t_matches_final');

      console.log('\n5. Verifying new table structure...');
      const newStructure = await client.execute('PRAGMA table_info(t_matches_final)');
      console.log('New table columns:');
      newStructure.rows.forEach(row => {
        console.log(`- ${row.name} (${row.type}${row.notnull ? ', NOT NULL' : ''}${row.dflt_value ? ', default: ' + row.dflt_value : ''})`);
      });

      console.log('\n✅ t_matches_final table structure fix completed successfully!');
      console.log('Changes made:');
      console.log('- ❌ Removed: confirmed_at column');
      console.log('- ✅ Added: updated_at column with JST timezone');
      console.log('- ✅ Updated: created_at default to use JST timezone');

    } else {
      console.error('\n❌ Data copy failed - record counts do not match!');
      console.error('Cleaning up new table...');
      await client.execute('DROP TABLE IF EXISTS t_matches_final_new');
    }

  } catch (error) {
    console.error('Error fixing t_matches_final table:', error);
    // Cleanup on error
    try {
      await client.execute('DROP TABLE IF EXISTS t_matches_final_new');
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  } finally {
    client.close();
  }
}

// Run the fix
fixMatchesFinalTable();