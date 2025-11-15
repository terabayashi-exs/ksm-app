// scripts/check-format-19.js
// Format ID:19の構造を確認するスクリプト

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

(async () => {
  try {
    // Format ID:19の基本情報
    const format = await db.execute('SELECT * FROM m_tournament_formats WHERE format_id = 19');
    console.log('=== Format ID:19 基本情報 ===');
    console.log(JSON.stringify(format.rows[0], null, 2));

    // Format ID:19の予選試合テンプレート
    const preliminaryTemplates = await db.execute(`
      SELECT match_code, phase, block_name, round_name, match_type
      FROM m_match_templates
      WHERE format_id = 19 AND phase = 'preliminary'
      ORDER BY match_number
    `);
    console.log('\n=== Format ID:19 予選試合テンプレート ===');
    console.log('試合数:', preliminaryTemplates.rows.length);
    console.log('ブロック構成:');
    const preliminaryBlocks = {};
    preliminaryTemplates.rows.forEach(row => {
      if (!preliminaryBlocks[row.block_name]) {
        preliminaryBlocks[row.block_name] = 0;
      }
      preliminaryBlocks[row.block_name]++;
    });
    Object.entries(preliminaryBlocks).forEach(([block, count]) => {
      console.log(`  ${block}ブロック: ${count}試合`);
    });

    // Format ID:19の決勝試合テンプレート
    const finalTemplates = await db.execute(`
      SELECT match_code, phase, block_name, round_name, match_type
      FROM m_match_templates
      WHERE format_id = 19 AND phase = 'final'
      ORDER BY match_number
    `);
    console.log('\n=== Format ID:19 決勝試合テンプレート ===');
    console.log('試合数:', finalTemplates.rows.length);
    console.log('ブロック構成:');
    const finalBlocks = {};
    finalTemplates.rows.forEach(row => {
      if (!finalBlocks[row.block_name]) {
        finalBlocks[row.block_name] = 0;
      }
      finalBlocks[row.block_name]++;
    });
    Object.entries(finalBlocks).forEach(([block, count]) => {
      console.log(`  ${block}ブロック: ${count}試合`);
    });

    console.log('\n決勝試合の最初の5試合:');
    finalTemplates.rows.slice(0, 5).forEach(row => {
      console.log(`  ${row.match_code} - Block:${row.block_name} Round:${row.round_name} Type:${row.match_type}`);
    });

    console.log('\n=== 結論 ===');
    console.log('予選: 複数ブロック存在 → リーグ戦形式');
    console.log('決勝: 複数ブロック存在 → リーグ戦形式');
    console.log('\n試合形式の判定方法:');
    console.log('- ブロック名が複数存在 → リーグ戦');
    console.log('- ブロック名が「決勝トーナメント」など単一 → トーナメント戦');
    console.log('- つまり、m_match_templatesの「block_name」の構造で判定している');

  } catch (error) {
    console.error('エラー:', error);
  }
})();
