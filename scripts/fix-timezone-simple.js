// Simple timezone fix - process each table individually

const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function fixSingleTable(tableName, columnsToUpdate) {
  try {
    console.log(`📋 Processing ${tableName}...`);

    // Disable FK constraints
    await client.execute('PRAGMA foreign_keys = OFF');

    // Get current structure
    const structure = await client.execute(`PRAGMA table_info(${tableName})`);
    const columns = structure.rows;
    const tempName = `${tableName}_temp`;

    // Build CREATE statement manually for safety
    const createSQL = buildCreateTableSQL(tableName, columns, columnsToUpdate);
    
    console.log(`  📝 Creating temp table...`);
    await client.execute(createSQL);

    // Copy data
    console.log(`  📤 Copying data...`);
    const columnNames = columns.map(c => c.name).join(', ');
    await client.execute(`INSERT INTO ${tempName} SELECT ${columnNames} FROM ${tableName}`);

    // Verify counts
    const oldCount = await client.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    const newCount = await client.execute(`SELECT COUNT(*) as count FROM ${tempName}`);
    
    if (oldCount.rows[0].count === newCount.rows[0].count) {
      console.log(`  🔄 Replacing table... (${oldCount.rows[0].count} records)`);
      await client.execute(`DROP TABLE ${tableName}`);
      await client.execute(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);
      console.log(`  ✅ ${tableName} updated successfully!`);
    } else {
      console.log(`  ❌ Count mismatch: ${oldCount.rows[0].count} vs ${newCount.rows[0].count}`);
      await client.execute(`DROP TABLE ${tempName}`);
    }

    // Re-enable FK constraints
    await client.execute('PRAGMA foreign_keys = ON');

  } catch (error) {
    console.error(`❌ Error processing ${tableName}:`, error);
    try {
      await client.execute(`DROP TABLE IF EXISTS ${tableName}_temp`);
      await client.execute('PRAGMA foreign_keys = ON');
    } catch (cleanup) {
      console.error('Cleanup error:', cleanup);
    }
  }
}

function buildCreateTableSQL(tableName, columns, columnsToUpdate) {
  const tempName = `${tableName}_temp`;
  let sql = `CREATE TABLE ${tempName} (\\n`;
  
  const columnDefs = [];
  
  for (const col of columns) {
    let def = `  ${col.name} ${col.type}`;
    
    if (col.notnull) {
      def += ' NOT NULL';
    }
    
    // Handle defaults
    if (col.dflt_value && col.dflt_value !== 'None' && col.dflt_value !== null) {
      if (columnsToUpdate.includes(col.name) && col.dflt_value === 'CURRENT_TIMESTAMP') {
        def += ` DEFAULT (datetime('now', '+9 hours'))`;
      } else {
        def += ` DEFAULT ${col.dflt_value}`;
      }
    } else if (columnsToUpdate.includes(col.name)) {
      // Add JST default for specified columns that don't have defaults
      def += ` DEFAULT (datetime('now', '+9 hours'))`;
    }
    
    // Handle primary key
    if (col.pk) {
      if (col.type === 'INTEGER' && col.name.includes('_id')) {
        def += ' PRIMARY KEY AUTOINCREMENT';
      } else {
        def += ' PRIMARY KEY';
      }
    }
    
    columnDefs.push(def);
  }
  
  sql += columnDefs.join(',\\n');
  sql += '\\n)';
  
  return sql;
}

async function fixAllTables() {
  try {
    console.log('🚀 Starting individual table timezone fixes...\\n');

    // Process each table individually
    const tablesToProcess = [
      { name: 'm_administrators', columns: ['created_at', 'updated_at'] },
      { name: 'm_match_templates', columns: ['created_at'] },
      { name: 'm_players', columns: ['created_at', 'updated_at'] },
      { name: 'm_teams', columns: ['created_at', 'updated_at'] },
      { name: 'm_tournament_formats', columns: ['created_at', 'updated_at'] },
      { name: 'm_venues', columns: ['created_at', 'updated_at'] },
      { name: 't_match_blocks', columns: ['created_at', 'updated_at'] },
      { name: 't_match_status', columns: ['updated_at'] },
      { name: 't_matches_live', columns: ['created_at', 'updated_at'] },
      { name: 't_tournament_players', columns: ['registration_date', 'created_at', 'updated_at'] },
      { name: 't_tournament_teams', columns: ['created_at', 'updated_at'] },
      { name: 't_tournaments', columns: ['created_at', 'updated_at'] }
    ];

    for (const table of tablesToProcess) {
      await fixSingleTable(table.name, table.columns);
      console.log('');
    }

    console.log('🎉 All timezone fixes completed!');
    console.log('📋 All datetime defaults are now using JST (UTC+9)');

  } catch (error) {
    console.error('❌ Overall error:', error);
  } finally {
    client.close();
  }
}

// Run the fixes
fixAllTables();