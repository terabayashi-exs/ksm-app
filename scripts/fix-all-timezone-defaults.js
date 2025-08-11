// Fix all datetime default values to use JST (UTC+9)
// Changes CURRENT_TIMESTAMP to datetime('now', '+9 hours')

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

// Tables and their datetime columns that need to be fixed
const TABLES_TO_FIX = [
  {
    name: 'm_administrators',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['admin_login_id', 'password_hash', 'email']
  },
  {
    name: 'm_match_templates', 
    datetimeColumns: ['created_at'],
    otherColumns: ['template_id', 'format_id', 'match_number', 'match_code', 'match_type', 'phase', 'round_name', 'block_name', 'team1_source', 'team2_source', 'team1_display_name', 'team2_display_name', 'day_number', 'execution_priority']
  },
  {
    name: 'm_players',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['player_id', 'player_name', 'jersey_number', 'current_team_id', 'is_active']
  },
  {
    name: 'm_teams',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['team_id', 'team_name', 'team_omission', 'contact_person', 'contact_email', 'contact_phone', 'representative_player_id', 'password_hash', 'is_active', 'registration_type']
  },
  {
    name: 'm_tournament_formats',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['format_id', 'format_name', 'target_team_count', 'format_description']
  },
  {
    name: 'm_venues',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['venue_id', 'venue_name', 'address', 'available_courts', 'is_active']
  },
  {
    name: 't_match_blocks',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['match_block_id', 'tournament_id', 'phase', 'display_round_name', 'block_name', 'match_type', 'block_order', 'team_rankings', 'remarks']
  },
  {
    name: 't_match_status',
    datetimeColumns: ['updated_at'],
    otherColumns: ['match_id', 'current_period', 'time_left', 'team1_score', 'team2_score', 'is_paused', 'actual_start_time', 'actual_end_time'],
    skipColumns: ['actual_start_time', 'actual_end_time'] // These should remain without defaults
  },
  {
    name: 't_matches_live',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['match_id', 'match_block_id', 'tournament_date', 'match_number', 'match_code', 'team1_id', 'team2_id', 'team1_display_name', 'team2_display_name', 'court_number', 'start_time', 'team1_scores', 'team2_scores', 'period_count', 'winner_team_id', 'is_draw', 'is_walkover', 'match_status', 'result_status', 'remarks', 'confirmed_by']
  },
  {
    name: 't_tournament_players',
    datetimeColumns: ['registration_date', 'created_at', 'updated_at'],
    otherColumns: ['tournament_player_id', 'tournament_id', 'team_id', 'player_id', 'jersey_number', 'player_status', 'withdrawal_date', 'remarks'],
    skipColumns: ['withdrawal_date'] // This should remain without default
  },
  {
    name: 't_tournament_teams',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['tournament_team_id', 'tournament_id', 'team_id', 'assigned_block', 'block_position']
  },
  {
    name: 't_tournaments',
    datetimeColumns: ['created_at', 'updated_at'],
    otherColumns: ['tournament_id', 'tournament_name', 'format_id', 'venue_id', 'team_count', 'court_count', 'tournament_dates', 'match_duration_minutes', 'break_duration_minutes', 'win_points', 'draw_points', 'loss_points', 'walkover_winner_goals', 'walkover_loser_goals', 'status', 'visibility', 'event_start_date', 'recruitment_start_date', 'recruitment_end_date']
  }
];

async function fixAllTimezones() {
  try {
    console.log('🚀 Starting timezone fix for all tables...\n');

    for (const tableInfo of TABLES_TO_FIX) {
      const tableName = tableInfo.name;
      const datetimeColumns = tableInfo.datetimeColumns;
      const otherColumns = tableInfo.otherColumns;
      const skipColumns = tableInfo.skipColumns || [];

      console.log(`📋 Processing table: ${tableName}`);

      // Step 1: Get current table structure
      const currentStructure = await client.execute(`PRAGMA table_info(${tableName})`);
      const columns = currentStructure.rows;

      // Step 2: Build new table schema with JST defaults
      const newTableName = `${tableName}_new`;
      let createTableSQL = `CREATE TABLE ${newTableName} (\n`;
      
      const columnDefs = [];
      
      for (const col of columns) {
        let columnDef = `  ${col.name} ${col.type}`;
        
        // Add NOT NULL if required
        if (col.notnull) {
          columnDef += ' NOT NULL';
        }
        
        // Handle default values
        if (col.dflt_value) {
          if (datetimeColumns.includes(col.name) && !skipColumns.includes(col.name)) {
            // Replace CURRENT_TIMESTAMP with JST datetime
            if (col.dflt_value === 'CURRENT_TIMESTAMP') {
              columnDef += ` DEFAULT (datetime('now', '+9 hours'))`;
            } else {
              columnDef += ` DEFAULT ${col.dflt_value}`;
            }
          } else {
            columnDef += ` DEFAULT ${col.dflt_value}`;
          }
        } else if (datetimeColumns.includes(col.name) && !skipColumns.includes(col.name)) {
          // Add JST default for datetime columns that don't have defaults
          columnDef += ` DEFAULT (datetime('now', '+9 hours'))`;
        }

        // Add primary key constraint
        if (col.pk) {
          if (col.type === 'INTEGER') {
            columnDef += ' PRIMARY KEY AUTOINCREMENT';
          } else {
            columnDef += ' PRIMARY KEY';
          }
        }

        columnDefs.push(columnDef);
      }

      createTableSQL += columnDefs.join(',\n') + '\n)';
      
      console.log(`  📝 Creating new table with JST defaults...`);
      await client.execute(createTableSQL);

      // Step 3: Copy data
      console.log(`  📤 Copying data from ${tableName} to ${newTableName}...`);
      const allColumns = columns.map(col => col.name).join(', ');
      await client.execute(`INSERT INTO ${newTableName} SELECT ${allColumns} FROM ${tableName}`);

      // Step 4: Verify data count
      const oldCount = await client.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      const newCount = await client.execute(`SELECT COUNT(*) as count FROM ${newTableName}`);
      
      console.log(`  📊 Records: ${oldCount.rows[0].count} → ${newCount.rows[0].count}`);

      if (oldCount.rows[0].count === newCount.rows[0].count) {
        // Step 5: Replace tables
        console.log(`  🔄 Replacing ${tableName} with new version...`);
        await client.execute(`DROP TABLE ${tableName}`);
        await client.execute(`ALTER TABLE ${newTableName} RENAME TO ${tableName}`);
        console.log(`  ✅ ${tableName} timezone fix completed!`);
      } else {
        console.log(`  ❌ Data count mismatch for ${tableName}, keeping old table`);
        await client.execute(`DROP TABLE ${newTableName}`);
      }

      console.log('');
    }

    console.log('🎉 All tables timezone fix completed successfully!');
    console.log('📋 Summary of changes:');
    console.log('  - Changed: CURRENT_TIMESTAMP → datetime(\'now\', \'+9 hours\')');
    console.log('  - Applied to: created_at, updated_at, registration_date columns');
    console.log('  - Preserved: actual_start_time, actual_end_time, withdrawal_date (no defaults)');

  } catch (error) {
    console.error('❌ Error during timezone fix:', error);
    
    // Cleanup any temporary tables
    console.log('🧹 Cleaning up temporary tables...');
    for (const tableInfo of TABLES_TO_FIX) {
      try {
        await client.execute(`DROP TABLE IF EXISTS ${tableInfo.name}_new`);
      } catch (cleanupError) {
        console.error(`Cleanup error for ${tableInfo.name}_new:`, cleanupError);
      }
    }
  } finally {
    client.close();
  }
}

// Run the fix
fixAllTimezones();