#!/usr/bin/env node

const { createClient } = require('@libsql/client');

// 環境変数の読み込み
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function testTemplateAPI() {
  try {
    // フォーマットID 29でテンプレートをテスト取得
    const result = await client.execute(`
      SELECT 
        template_id,
        format_id,
        match_number,
        match_code,
        match_type,
        phase,
        round_name,
        block_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name,
        day_number,
        execution_priority,
        created_at
      FROM m_match_templates
      WHERE format_id = ?
      ORDER BY day_number ASC, execution_priority ASC, match_number ASC
    `, [29]);

    console.log(`🔍 APIテスト: フォーマットID 29で${result.rows.length}件の試合テンプレートを取得`);
    
    if (result.rows.length > 0) {
      console.log('✅ 最初の試合テンプレート:');
      const first = result.rows[0];
      console.log(`   試合番号: ${first.match_number}`);
      console.log(`   試合コード: ${first.match_code}`);
      console.log(`   フェーズ: ${first.phase}`);
      console.log(`   ブロック: ${first.block_name}`);
      console.log(`   対戦: ${first.team1_display_name} vs ${first.team2_display_name}`);
      console.log(`   日程: ${first.day_number}日目`);
      console.log(`   優先度: ${first.execution_priority}`);
    }

    // エラーがないことを確認
    console.log('✅ SQLクエリは正常に実行されました');
    
  } catch (error) {
    console.error('❌ SQLクエリエラー:', error);
  }
}

testTemplateAPI();