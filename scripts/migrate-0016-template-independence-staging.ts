/**
 * マイグレーション 0016: テンプレート独立化 (staging環境)
 *
 * 1. DDL適用: t_tournaments, t_matches_live, t_matches_final にカラム追加
 * 2. データバックフィル: m_tournament_formats / m_match_templates から既存データにコピー
 * 3. マイグレーション履歴に記録
 *
 * 使用方法:
 *   npx tsx scripts/migrate-0016-template-independence-staging.ts
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_STAG!,
  authToken: process.env.DATABASE_AUTH_TOKEN_STAG,
});

// 0016のDDL文一覧
const ddlStatements = [
  // t_tournaments
  "ALTER TABLE t_tournaments ADD COLUMN preliminary_format_type TEXT",
  "ALTER TABLE t_tournaments ADD COLUMN final_format_type TEXT",
  "ALTER TABLE t_tournaments ADD COLUMN phases TEXT",
  // t_matches_live
  "ALTER TABLE t_matches_live ADD COLUMN phase TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN match_type TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN round_name TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN block_name TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN team1_source TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN team2_source TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN day_number INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN execution_priority INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN suggested_start_time TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN loser_position_start INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN loser_position_end INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN position_note TEXT",
  "ALTER TABLE t_matches_live ADD COLUMN winner_position INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN is_bye_match INTEGER DEFAULT 0",
  "ALTER TABLE t_matches_live ADD COLUMN matchday INTEGER",
  "ALTER TABLE t_matches_live ADD COLUMN cycle INTEGER DEFAULT 1",
  // t_matches_final
  "ALTER TABLE t_matches_final ADD COLUMN phase TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN match_type TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN round_name TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN block_name TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN team1_source TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN team2_source TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN day_number INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN execution_priority INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN suggested_start_time TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN loser_position_start INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN loser_position_end INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN position_note TEXT",
  "ALTER TABLE t_matches_final ADD COLUMN winner_position INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN is_bye_match INTEGER DEFAULT 0",
  "ALTER TABLE t_matches_final ADD COLUMN matchday INTEGER",
  "ALTER TABLE t_matches_final ADD COLUMN cycle INTEGER DEFAULT 1",
];

async function applyDDL() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 1: DDL適用');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let applied = 0;
  let skipped = 0;

  for (const sql of ddlStatements) {
    try {
      await db.execute(sql);
      console.log(`  ✓ ${sql.substring(0, 80)}`);
      applied++;
    } catch (e: any) {
      if (e.message?.includes('duplicate') || e.message?.includes('already exists')) {
        console.log(`  ⊘ スキップ (既存): ${sql.substring(0, 80)}`);
        skipped++;
      } else {
        throw e;
      }
    }
  }

  console.log(`\n  適用: ${applied}件, スキップ: ${skipped}件\n`);
}

async function backfillTournaments() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 2: t_tournaments バックフィル');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tournaments = await db.execute(`
    SELECT t.tournament_id, t.format_id, t.tournament_name,
           t.preliminary_format_type, t.final_format_type, t.phases
    FROM t_tournaments t
  `);

  console.log(`  部門数: ${tournaments.rows.length}件\n`);

  let updated = 0;
  for (const t of tournaments.rows) {
    if (t.preliminary_format_type && t.final_format_type) {
      console.log(`  [skip] tournament_id=${t.tournament_id} "${t.tournament_name}" - 既にコピー済み`);
      continue;
    }

    const format = await db.execute(`
      SELECT preliminary_format_type, final_format_type, phases
      FROM m_tournament_formats
      WHERE format_id = ?
    `, [t.format_id]);

    if (format.rows.length === 0) {
      console.log(`  [warn] tournament_id=${t.tournament_id} "${t.tournament_name}" - format_id=${t.format_id} が見つかりません`);
      continue;
    }

    const f = format.rows[0];
    await db.execute(`
      UPDATE t_tournaments SET
        preliminary_format_type = ?,
        final_format_type = ?,
        phases = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ?
    `, [
      f.preliminary_format_type,
      f.final_format_type,
      typeof f.phases === 'string' ? f.phases : JSON.stringify(f.phases),
      t.tournament_id
    ]);
    updated++;
    console.log(`  [ok] tournament_id=${t.tournament_id} "${t.tournament_name}" - preliminary=${f.preliminary_format_type}, final=${f.final_format_type}`);
  }

  console.log(`\n  更新: ${updated}件\n`);
}

async function backfillMatchesLive() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 3: t_matches_live バックフィル');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const matches = await db.execute(`
    SELECT ml.match_id, ml.match_code, ml.match_block_id,
      mb.phase as block_phase, mb.tournament_id
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE ml.phase IS NULL
  `);

  console.log(`  対象: ${matches.rows.length}件\n`);

  let updated = 0;
  let notFound = 0;
  const formatCache = new Map<number, number>();

  for (const m of matches.rows) {
    const tournamentId = m.tournament_id as number;

    if (!formatCache.has(tournamentId)) {
      const tResult = await db.execute(
        'SELECT format_id FROM t_tournaments WHERE tournament_id = ?',
        [tournamentId]
      );
      if (tResult.rows.length > 0) {
        formatCache.set(tournamentId, tResult.rows[0].format_id as number);
      }
    }

    const formatId = formatCache.get(tournamentId);
    if (!formatId) {
      console.log(`  [warn] match_id=${m.match_id} - tournament format not found`);
      notFound++;
      continue;
    }

    const template = await db.execute(`
      SELECT match_type, phase, round_name, block_name,
        team1_source, team2_source, day_number, execution_priority,
        suggested_start_time, loser_position_start, loser_position_end,
        position_note, winner_position, is_bye_match, matchday, cycle
      FROM m_match_templates
      WHERE format_id = ? AND match_code = ? AND phase = ?
    `, [formatId, m.match_code, m.block_phase]);

    if (template.rows.length === 0) {
      console.log(`  [warn] match_id=${m.match_id} - テンプレート見つからず (format_id=${formatId}, match_code=${m.match_code}, phase=${m.block_phase})`);
      notFound++;
      continue;
    }

    const t = template.rows[0];
    await db.execute(`
      UPDATE t_matches_live SET
        phase = ?, match_type = ?, round_name = ?, block_name = ?,
        team1_source = ?, team2_source = ?, day_number = ?,
        execution_priority = ?, suggested_start_time = ?,
        loser_position_start = ?, loser_position_end = ?,
        position_note = ?, winner_position = ?,
        is_bye_match = ?, matchday = ?, cycle = ?
      WHERE match_id = ?
    `, [
      t.phase, t.match_type, t.round_name, t.block_name,
      t.team1_source, t.team2_source, t.day_number, t.execution_priority,
      t.suggested_start_time, t.loser_position_start, t.loser_position_end,
      t.position_note, t.winner_position, t.is_bye_match ?? 0,
      t.matchday, t.cycle ?? 1,
      m.match_id
    ]);
    updated++;
  }

  console.log(`\n  更新: ${updated}件, マッチなし: ${notFound}件\n`);
}

async function backfillMatchesFinal() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 4: t_matches_final バックフィル');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const matches = await db.execute(`
    SELECT mf.match_id, mf.match_code, mf.match_block_id,
      mb.phase as block_phase, mb.tournament_id
    FROM t_matches_final mf
    JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
    WHERE mf.phase IS NULL
  `);

  console.log(`  対象: ${matches.rows.length}件\n`);

  let updated = 0;
  let notFound = 0;
  const formatCache = new Map<number, number>();

  for (const m of matches.rows) {
    const tournamentId = m.tournament_id as number;

    if (!formatCache.has(tournamentId)) {
      const tResult = await db.execute(
        'SELECT format_id FROM t_tournaments WHERE tournament_id = ?',
        [tournamentId]
      );
      if (tResult.rows.length > 0) {
        formatCache.set(tournamentId, tResult.rows[0].format_id as number);
      }
    }

    const formatId = formatCache.get(tournamentId);
    if (!formatId) {
      console.log(`  [warn] match_id=${m.match_id} - tournament format not found`);
      notFound++;
      continue;
    }

    const template = await db.execute(`
      SELECT match_type, phase, round_name, block_name,
        team1_source, team2_source, day_number, execution_priority,
        suggested_start_time, loser_position_start, loser_position_end,
        position_note, winner_position, is_bye_match, matchday, cycle
      FROM m_match_templates
      WHERE format_id = ? AND match_code = ? AND phase = ?
    `, [formatId, m.match_code, m.block_phase]);

    if (template.rows.length === 0) {
      console.log(`  [warn] match_id=${m.match_id} - テンプレート見つからず`);
      notFound++;
      continue;
    }

    const t = template.rows[0];
    await db.execute(`
      UPDATE t_matches_final SET
        phase = ?, match_type = ?, round_name = ?, block_name = ?,
        team1_source = ?, team2_source = ?, day_number = ?,
        execution_priority = ?, suggested_start_time = ?,
        loser_position_start = ?, loser_position_end = ?,
        position_note = ?, winner_position = ?,
        is_bye_match = ?, matchday = ?, cycle = ?
      WHERE match_id = ?
    `, [
      t.phase, t.match_type, t.round_name, t.block_name,
      t.team1_source, t.team2_source, t.day_number, t.execution_priority,
      t.suggested_start_time, t.loser_position_start, t.loser_position_end,
      t.position_note, t.winner_position, t.is_bye_match ?? 0,
      t.matchday, t.cycle ?? 1,
      m.match_id
    ]);
    updated++;
  }

  console.log(`\n  更新: ${updated}件, マッチなし: ${notFound}件\n`);
}

async function recordMigration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 5: マイグレーション履歴記録');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    await db.execute({
      sql: 'INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)',
      args: [17, '0016_template_independence', 1740672000000]
    });
    console.log('  ✓ マイグレーション履歴に記録完了\n');
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      console.log('  ⊘ 既に記録済み\n');
    } else {
      throw e;
    }
  }
}

async function verify() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STEP 6: 検証');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // t_tournaments の確認
  const tournaments = await db.execute(`
    SELECT tournament_id, tournament_name, preliminary_format_type, final_format_type
    FROM t_tournaments
  `);
  console.log('  [t_tournaments]');
  for (const t of tournaments.rows) {
    console.log(`    id=${t.tournament_id} "${t.tournament_name}" - preliminary=${t.preliminary_format_type}, final=${t.final_format_type}`);
  }

  // t_matches_live の未設定件数
  const liveNull = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_live WHERE phase IS NULL');
  const liveTotal = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_live');
  console.log(`\n  [t_matches_live] 総数=${liveTotal.rows[0].cnt}, phase未設定=${liveNull.rows[0].cnt}`);

  // t_matches_final の未設定件数
  const finalNull = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_final WHERE phase IS NULL');
  const finalTotal = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_final');
  console.log(`  [t_matches_final] 総数=${finalTotal.rows[0].cnt}, phase未設定=${finalNull.rows[0].cnt}`);
}

async function main() {
  console.log('\n🔄 マイグレーション 0016: テンプレート独立化 (staging環境)\n');

  try {
    await applyDDL();
    await backfillTournaments();
    await backfillMatchesLive();
    await backfillMatchesFinal();
    await recordMigration();
    await verify();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ マイグレーション 0016 完了');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
