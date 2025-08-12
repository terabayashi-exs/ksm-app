#!/usr/bin/env node

// Check table structure
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function checkTableStructure() {
  try {
    console.log('🔍 Checking t_matches_live table structure...\n');
    
    const structure = await client.execute('PRAGMA table_info(t_matches_live)');
    
    console.log('📋 t_matches_live columns:');
    structure.rows.forEach(row => {
      console.log(`  ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });

    console.log('\n🔍 Checking t_match_blocks table structure...\n');
    
    const mbStructure = await client.execute('PRAGMA table_info(t_match_blocks)');
    
    console.log('📋 t_match_blocks columns:');
    mbStructure.rows.forEach(row => {
      console.log(`  ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });

    console.log('\n🔍 Checking t_matches_final table structure...\n');
    
    const mfStructure = await client.execute('PRAGMA table_info(t_matches_final)');
    
    console.log('📋 t_matches_final columns:');
    mfStructure.rows.forEach(row => {
      console.log(`  ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });

  } catch (error) {
    console.error('❌ Error checking table structure:', error);
  } finally {
    client.close();
  }
}

checkTableStructure();