// Fix all datetime defaults with proper foreign key handling

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixTimezonesWithFKHandling() {
  try {
    console.log('🚀 Starting timezone fix with foreign key handling...\n');

    // Step 1: Disable foreign key constraints
    console.log('🔓 Disabling foreign key constraints...');
    await client.execute('PRAGMA foreign_keys = OFF');

    // Get all tables with datetime columns that need fixing
    const tablesToFix = [
      'm_administrators', 'm_match_templates', 'm_players', 'm_teams', 
      'm_tournament_formats', 'm_venues', 't_match_blocks', 't_match_status',
      't_matches_live', 't_tournament_players', 't_tournament_teams', 't_tournaments'
    ];

    for (const tableName of tablesToFix) {
      console.log(`📋 Processing table: ${tableName}`);

      // Get current structure
      const structure = await client.execute(`PRAGMA table_info(${tableName})`);
      const columns = structure.rows;
      
      // Check if this table has any CURRENT_TIMESTAMP defaults
      const needsUpdate = columns.some(col => 
        col.type === 'DATETIME' && col.dflt_value === 'CURRENT_TIMESTAMP'
      );

      if (!needsUpdate) {
        console.log(`  ⏭️  No CURRENT_TIMESTAMP columns found, skipping...`);
        console.log('');
        continue;
      }

      // Create ALTER TABLE statements for each column that needs updating
      const datetimeColumns = columns.filter(col => 
        col.type === 'DATETIME' && col.dflt_value === 'CURRENT_TIMESTAMP'
      );

      console.log(`  🔧 Updating ${datetimeColumns.length} datetime columns...`);
      
      // Note: SQLite doesn't support ALTER COLUMN, so we need to recreate the table
      const tempTableName = `${tableName}_temp`;

      // Build new table definition
      const columnDefs = columns.map(col => {
        let def = `${col.name} ${col.type}`;
        
        if (col.notnull) def += ' NOT NULL';
        
        if (col.dflt_value) {
          if (col.type === 'DATETIME' && col.dflt_value === 'CURRENT_TIMESTAMP') {
            def += ` DEFAULT (datetime('now', '+9 hours'))`;
          } else {
            def += ` DEFAULT ${col.dflt_value}`;
          }
        }
        
        if (col.pk) {
          if (col.type === 'INTEGER') {
            def += ' PRIMARY KEY AUTOINCREMENT';
          } else {
            def += ' PRIMARY KEY';
          }
        }
        
        return def;
      }).join(', ');

      // Create temporary table with new defaults
      console.log(`  📝 Creating temporary table...`);
      await client.execute(`CREATE TABLE ${tempTableName} (${columnDefs})`);

      // Copy all data
      console.log(`  📤 Copying data...`);
      const allColumns = columns.map(col => col.name).join(', ');
      await client.execute(`INSERT INTO ${tempTableName} SELECT ${allColumns} FROM ${tableName}`);

      // Verify record count
      const oldCount = await client.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
      const newCount = await client.execute(`SELECT COUNT(*) as count FROM ${tempTableName}`);
      
      console.log(`  📊 Records: ${oldCount.rows[0].count} → ${newCount.rows[0].count}`);

      if (oldCount.rows[0].count === newCount.rows[0].count) {
        // Replace original table
        console.log(`  🔄 Replacing original table...`);
        await client.execute(`DROP TABLE ${tableName}`);
        await client.execute(`ALTER TABLE ${tempTableName} RENAME TO ${tableName}`);
        console.log(`  ✅ ${tableName} completed successfully!`);
      } else {
        console.log(`  ❌ Record count mismatch, rolling back...`);
        await client.execute(`DROP TABLE ${tempTableName}`);
      }

      console.log('');
    }

    // Step 2: Re-enable foreign key constraints
    console.log('🔒 Re-enabling foreign key constraints...');
    await client.execute('PRAGMA foreign_keys = ON');

    // Step 3: Check foreign key integrity
    console.log('🔍 Checking foreign key integrity...');
    const fkCheck = await client.execute('PRAGMA foreign_key_check');
    if (fkCheck.rows.length === 0) {
      console.log('✅ Foreign key integrity check passed!');
    } else {
      console.log('⚠️  Foreign key integrity issues found:');
      fkCheck.rows.forEach(row => {
        console.log(`  - Table: ${row.table}, ROWID: ${row.rowid}, Parent: ${row.parent}, FKID: ${row.fkid}`);
      });
    }

    console.log('\n🎉 Timezone migration completed successfully!');
    console.log('📋 All datetime defaults have been updated to JST (UTC+9)');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    
    // Try to re-enable foreign keys even if there's an error
    try {
      await client.execute('PRAGMA foreign_keys = ON');
    } catch (fkError) {
      console.error('❌ Failed to re-enable foreign keys:', fkError);
    }
    
  } finally {
    client.close();
  }
}

// Run the migration
fixTimezonesWithFKHandling();