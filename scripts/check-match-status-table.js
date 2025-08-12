#!/usr/bin/env node

// Check t_match_status table structure
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkMatchStatusTable() {
  try {
    console.log('🔍 Checking t_match_status table structure...\n');
    
    const structure = await client.execute('PRAGMA table_info(t_match_status)');
    
    console.log('📋 t_match_status columns:');
    structure.rows.forEach(row => {
      console.log(`  ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });

    console.log('\n🔍 Checking if t_match_status table has data...\n');
    
    const count = await client.execute('SELECT COUNT(*) as count FROM t_match_status');
    console.log(`📊 t_match_status has ${count.rows[0].count} records`);

    console.log('\n🔍 Sample t_match_status records...\n');
    
    const samples = await client.execute('SELECT * FROM t_match_status LIMIT 3');
    if (samples.rows.length > 0) {
      samples.rows.forEach((row, index) => {
        console.log(`  Record ${index + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
        console.log('');
      });
    } else {
      console.log('  No records found in t_match_status');
    }

  } catch (error) {
    console.error('❌ Error checking t_match_status table:', error);
    
    // Check if table exists
    try {
      const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='t_match_status'");
      if (tables.rows.length === 0) {
        console.log('⚠️  t_match_status table does not exist!');
      }
    } catch (checkError) {
      console.error('Error checking table existence:', checkError);
    }
  } finally {
    client.close();
  }
}

checkMatchStatusTable();