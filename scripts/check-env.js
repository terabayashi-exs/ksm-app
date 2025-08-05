// scripts/check-env.js
// 環境変数の読み込み状況を確認するスクリプト

// .env.localファイルを読み込み
require('dotenv').config({ path: '.env.local' });

console.log('=== Environment Variables Check ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET');
console.log('DATABASE_AUTH_TOKEN:', process.env.DATABASE_AUTH_TOKEN ? 'SET (hidden)' : 'NOT SET');
console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
console.log('NEXTAUTH_SECRET:', process.env.NEXTAUTH_SECRET ? 'SET (hidden)' : 'NOT SET');

console.log('\n=== All DATABASE-related env vars ===');
Object.keys(process.env)
  .filter(key => key.includes('DATABASE') || key.includes('DB'))
  .forEach(key => {
    console.log(`${key}:`, process.env[key] ? 'SET' : 'NOT SET');
  });

console.log('\n=== Testing database connection ===');
try {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  console.log('✅ Database client created successfully');
  
  // 簡単なクエリでテスト
  client.execute('SELECT 1 as test')
    .then(result => {
      console.log('✅ Database connection test passed:', result.rows);
    })
    .catch(error => {
      console.log('❌ Database connection test failed:', error.message);
    });
    
} catch (error) {
  console.log('❌ Failed to create database client:', error.message);
}