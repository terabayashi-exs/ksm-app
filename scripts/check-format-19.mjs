import { db } from '../lib/db.js';

(async () => {
  console.log('フォーマットID:19のテンプレート確認\n');

  const templates = await db.execute(`
    SELECT
      template_id,
      match_code,
      match_type,
      phase,
      block_name,
      day_number,
      execution_priority
    FROM m_match_templates
    WHERE format_id = 19
    ORDER BY day_number, execution_priority, match_number
  `);

  console.log(`総テンプレート数: ${templates.rows.length}\n`);

  // day_numberごとにグループ化
  const byDay = {};
  for (const t of templates.rows) {
    const day = t.day_number || 'null';
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  }

  for (const [day, temps] of Object.entries(byDay)) {
    console.log(`\n=== Day ${day} (${temps.length}試合) ===`);
    const blocks = new Set();
    temps.forEach(t => blocks.add(t.block_name));
    console.log(`ブロック: ${Array.from(blocks).join(', ')}`);

    // 最初の3試合を表示
    console.log('\n最初の3試合:');
    temps.slice(0, 3).forEach(t => {
      console.log(`  ${t.match_code}: ${t.block_name} (phase: ${t.phase})`);
    });
  }

  process.exit(0);
})();
