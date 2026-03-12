import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

const ddl = [
  'ALTER TABLE t_tournaments ADD COLUMN preliminary_format_type TEXT',
  'ALTER TABLE t_tournaments ADD COLUMN final_format_type TEXT',
  'ALTER TABLE t_tournaments ADD COLUMN phases TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN phase TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN match_type TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN round_name TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN block_name TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN team1_source TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN team2_source TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN day_number INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN execution_priority INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN suggested_start_time TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN loser_position_start INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN loser_position_end INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN position_note TEXT',
  'ALTER TABLE t_matches_live ADD COLUMN winner_position INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN is_bye_match INTEGER DEFAULT 0',
  'ALTER TABLE t_matches_live ADD COLUMN matchday INTEGER',
  'ALTER TABLE t_matches_live ADD COLUMN cycle INTEGER DEFAULT 1',
  'ALTER TABLE t_matches_final ADD COLUMN phase TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN match_type TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN round_name TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN block_name TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN team1_source TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN team2_source TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN day_number INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN execution_priority INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN suggested_start_time TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN loser_position_start INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN loser_position_end INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN position_note TEXT',
  'ALTER TABLE t_matches_final ADD COLUMN winner_position INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN is_bye_match INTEGER DEFAULT 0',
  'ALTER TABLE t_matches_final ADD COLUMN matchday INTEGER',
  'ALTER TABLE t_matches_final ADD COLUMN cycle INTEGER DEFAULT 1',
];

async function main() {
  console.log('0016 テンプレート独立化 (main環境)\n');

  // DDL
  let applied = 0, skipped = 0;
  for (const sql of ddl) {
    try { await db.execute(sql); applied++; }
    catch (e: any) {
      if (e.message?.includes('duplicate') || e.message?.includes('already exists')) skipped++;
      else throw e;
    }
  }
  console.log(`DDL: 適用=${applied} スキップ=${skipped}`);

  // バックフィル: t_tournaments
  const tournaments = await db.execute('SELECT tournament_id, tournament_name, format_id, preliminary_format_type, final_format_type, phases FROM t_tournaments');
  let tUpdated = 0;
  for (const t of tournaments.rows) {
    if (t.preliminary_format_type && t.final_format_type) continue;
    const format = await db.execute({ sql: 'SELECT preliminary_format_type, final_format_type, phases FROM m_tournament_formats WHERE format_id = ?', args: [t.format_id] });
    if (format.rows.length === 0) continue;
    const f = format.rows[0];

    let phasesValue = typeof f.phases === 'string' ? f.phases : JSON.stringify(f.phases);
    if (f.phases === null || f.phases === undefined || phasesValue === 'null') {
      const phases = [];
      if (f.preliminary_format_type) phases.push({ id: 'preliminary', order: 1, name: '予選', format_type: f.preliminary_format_type });
      if (f.final_format_type) phases.push({ id: 'final', order: 2, name: '決勝トーナメント', format_type: f.final_format_type });
      phasesValue = JSON.stringify({ phases });
    }

    await db.execute({
      sql: "UPDATE t_tournaments SET preliminary_format_type=?, final_format_type=?, phases=?, updated_at=datetime('now','+9 hours') WHERE tournament_id=?",
      args: [f.preliminary_format_type, f.final_format_type, phasesValue, t.tournament_id]
    });
    tUpdated++;
    console.log(`  t_tournaments id=${t.tournament_id} "${t.tournament_name}"`);
  }
  console.log(`t_tournaments 更新: ${tUpdated}件`);

  // バックフィル: t_matches_live
  const formatCache = new Map<number, number>();
  const liveMatches = await db.execute(`
    SELECT ml.match_id, ml.match_code, ml.match_block_id, mb.phase as block_phase, mb.tournament_id
    FROM t_matches_live ml JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE ml.phase IS NULL
  `);
  let liveUpdated = 0, liveNotFound = 0;
  for (const m of liveMatches.rows) {
    const tid = m.tournament_id as number;
    if (!formatCache.has(tid)) {
      const r = await db.execute({ sql: 'SELECT format_id FROM t_tournaments WHERE tournament_id=?', args: [tid] });
      if (r.rows.length > 0) formatCache.set(tid, r.rows[0].format_id as number);
    }
    const formatId = formatCache.get(tid);
    if (!formatId) { liveNotFound++; continue; }
    const tmpl = await db.execute({
      sql: 'SELECT match_type,phase,round_name,block_name,team1_source,team2_source,day_number,execution_priority,suggested_start_time,loser_position_start,loser_position_end,position_note,winner_position,is_bye_match,matchday,cycle FROM m_match_templates WHERE format_id=? AND match_code=? AND phase=?',
      args: [formatId, m.match_code, m.block_phase]
    });
    if (tmpl.rows.length === 0) { liveNotFound++; continue; }
    const t = tmpl.rows[0];
    await db.execute({
      sql: 'UPDATE t_matches_live SET phase=?,match_type=?,round_name=?,block_name=?,team1_source=?,team2_source=?,day_number=?,execution_priority=?,suggested_start_time=?,loser_position_start=?,loser_position_end=?,position_note=?,winner_position=?,is_bye_match=?,matchday=?,cycle=? WHERE match_id=?',
      args: [t.phase, t.match_type, t.round_name, t.block_name, t.team1_source, t.team2_source, t.day_number, t.execution_priority, t.suggested_start_time, t.loser_position_start, t.loser_position_end, t.position_note, t.winner_position, t.is_bye_match ?? 0, t.matchday, t.cycle ?? 1, m.match_id]
    });
    liveUpdated++;
  }
  console.log(`t_matches_live 更新: ${liveUpdated}件, マッチなし: ${liveNotFound}件`);

  // バックフィル: t_matches_final
  const finalMatches = await db.execute(`
    SELECT mf.match_id, mf.match_code, mf.match_block_id, mb.phase as block_phase, mb.tournament_id
    FROM t_matches_final mf JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
    WHERE mf.phase IS NULL
  `);
  let finalUpdated = 0, finalNotFound = 0;
  for (const m of finalMatches.rows) {
    const tid = m.tournament_id as number;
    if (!formatCache.has(tid)) {
      const r = await db.execute({ sql: 'SELECT format_id FROM t_tournaments WHERE tournament_id=?', args: [tid] });
      if (r.rows.length > 0) formatCache.set(tid, r.rows[0].format_id as number);
    }
    const formatId = formatCache.get(tid);
    if (!formatId) { finalNotFound++; continue; }
    const tmpl = await db.execute({
      sql: 'SELECT match_type,phase,round_name,block_name,team1_source,team2_source,day_number,execution_priority,suggested_start_time,loser_position_start,loser_position_end,position_note,winner_position,is_bye_match,matchday,cycle FROM m_match_templates WHERE format_id=? AND match_code=? AND phase=?',
      args: [formatId, m.match_code, m.block_phase]
    });
    if (tmpl.rows.length === 0) { finalNotFound++; continue; }
    const t = tmpl.rows[0];
    await db.execute({
      sql: 'UPDATE t_matches_final SET phase=?,match_type=?,round_name=?,block_name=?,team1_source=?,team2_source=?,day_number=?,execution_priority=?,suggested_start_time=?,loser_position_start=?,loser_position_end=?,position_note=?,winner_position=?,is_bye_match=?,matchday=?,cycle=? WHERE match_id=?',
      args: [t.phase, t.match_type, t.round_name, t.block_name, t.team1_source, t.team2_source, t.day_number, t.execution_priority, t.suggested_start_time, t.loser_position_start, t.loser_position_end, t.position_note, t.winner_position, t.is_bye_match ?? 0, t.matchday, t.cycle ?? 1, m.match_id]
    });
    finalUpdated++;
  }
  console.log(`t_matches_final 更新: ${finalUpdated}件, マッチなし: ${finalNotFound}件`);

  // マイグレーション履歴
  try {
    await db.execute({ sql: 'INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)', args: [20, '0016_template_independence', 1740672000000] });
    console.log('✓ マイグレーション履歴に記録完了');
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) console.log('⊘ 既に記録済み');
    else throw e;
  }

  console.log('\n✅ 0016 完了');
  db.close();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
