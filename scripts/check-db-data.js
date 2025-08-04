#!/usr/bin/env node

const { createClient } = require('@libsql/client');

// 環境変数の読み込み
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function checkData() {
  try {
    // フォーマットを確認
    const formats = await client.execute('SELECT * FROM m_tournament_formats');
    console.log('🏆 登録済み大会フォーマット:');
    formats.rows.forEach(row => {
      console.log(`   ID: ${row.format_id}, 名前: ${row.format_name}, 対象チーム: ${row.target_team_count}`);
    });

    // 会場を確認
    const venues = await client.execute('SELECT * FROM m_venues');
    console.log('\n📍 登録済み会場:');
    venues.rows.forEach(row => {
      console.log(`   ID: ${row.venue_id}, 名前: ${row.venue_name}`);
    });

    // テンプレートを確認
    const templates = await client.execute('SELECT COUNT(*) as count FROM m_match_templates');
    console.log(`\n⚽ 登録済み試合テンプレート: ${templates.rows[0].count}件`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

checkData();