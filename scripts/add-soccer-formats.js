// scripts/add-soccer-formats.js
// サッカー用大会フォーマットとテンプレートを追加

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// 環境変数から接続情報を取得
const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function addSoccerFormats() {
  try {
    console.log('🏈 サッカー大会フォーマット追加開始...');

    // 1. サッカー用大会フォーマット追加
    console.log('📋 サッカー用大会フォーマットを追加中...');
    
    const formatsPath = path.join(__dirname, '..', 'data', 'soccer_tournament_formats.json');
    const formats = JSON.parse(fs.readFileSync(formatsPath, 'utf8'));
    
    for (const format of formats) {
      // 既存チェック
      const existing = await client.execute(`
        SELECT format_id FROM m_tournament_formats WHERE format_id = ?
      `, [format.format_id]);
      
      if (existing.rows.length > 0) {
        console.log(`⚠️  フォーマットID ${format.format_id} は既に存在します - スキップ`);
        continue;
      }
      
      await client.execute(`
        INSERT INTO m_tournament_formats (
          format_id, sport_type_id, format_name, target_team_count, format_description
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        format.format_id,
        format.sport_type_id,
        format.format_name,
        format.target_team_count,
        format.format_description
      ]);
      
      console.log(`✅ ${format.format_name} を追加`);
    }

    // 2. 8チームサッカー用試合テンプレート追加
    console.log('\n🎯 8チームサッカー用試合テンプレートを追加中...');
    
    const templatesPath = path.join(__dirname, '..', 'data', 'soccer_match_templates_8team.json');
    const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
    
    // 既存テンプレートを削除（format_id = 11）
    await client.execute(`
      DELETE FROM m_match_templates WHERE format_id = 11
    `);
    console.log('既存テンプレート（format_id=11）をクリア');
    
    for (const template of templates) {
      await client.execute(`
        INSERT INTO m_match_templates (
          format_id, match_number, match_code, match_type, phase, round_name,
          block_name, team1_source, team2_source, team1_display_name,
          team2_display_name, day_number, execution_priority, period_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        template.format_id,
        template.match_number,
        template.match_code,
        template.match_type,
        template.phase,
        template.round_name,
        template.block_name,
        template.team1_source,
        template.team2_source,
        template.team1_display_name,
        template.team2_display_name,
        template.day_number,
        template.execution_priority,
        template.period_count || 2  // サッカーのデフォルトは2（前半・後半）
      ]);
    }
    
    console.log(`✅ ${templates.length}個の試合テンプレートを追加`);

    // 3. 登録結果の確認
    console.log('\n📊 登録結果確認...');
    
    const formatsResult = await client.execute(`
      SELECT f.format_name, f.target_team_count, s.sport_name, 
             COUNT(t.template_id) as template_count
      FROM m_tournament_formats f
      LEFT JOIN m_sport_types s ON f.sport_type_id = s.sport_type_id
      LEFT JOIN m_match_templates t ON f.format_id = t.format_id
      WHERE f.format_id IN (11, 12, 13)
      GROUP BY f.format_id, f.format_name, f.target_team_count, s.sport_name
      ORDER BY f.format_id
    `);
    
    console.log('\n🏈 サッカー用フォーマット一覧:');
    for (const row of formatsResult.rows) {
      console.log(`  📋 ${row.format_name} (${row.target_team_count}チーム, ${row.sport_name})`);
      console.log(`      └ 試合テンプレート: ${row.template_count}個`);
    }

    console.log('\n✅ サッカー大会フォーマット追加完了！');

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// 実行
addSoccerFormats();