/**
 * t_tournament_teamsの孤立team_idを修正するスクリプト
 * 前回の中途半端なUUID化で残った不整合を解消する
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

async function main() {
  const orphans = await db.execute(`
    SELECT tt.tournament_team_id, tt.team_id as orphan_uuid, tt.team_name, tt.tournament_id
    FROM t_tournament_teams tt
    WHERE tt.team_id NOT IN (SELECT team_id FROM m_teams)
  `);

  console.log(`孤立レコード: ${orphans.rows.length}件\n`);

  for (const r of orphans.rows) {
    const tournamentId = r.tournament_id;

    // 同じ大会の正常なレコードからメールパターンを取得
    const normalRecords = await db.execute({
      sql: `SELECT m.contact_email
            FROM t_tournament_teams tt
            JOIN m_teams m ON tt.team_id = m.team_id
            WHERE tt.tournament_id = ? LIMIT 5`,
      args: [tournamentId]
    });

    const emails = normalRecords.rows.map(r => String(r.contact_email || ''));
    const has74 = emails.some(e => e.includes('74team'));
    const has75 = emails.some(e => e.includes('75team'));

    // 同名チーム候補
    const candidates = await db.execute({
      sql: 'SELECT team_id, contact_email FROM m_teams WHERE team_name = ?',
      args: [r.team_name]
    });

    let matched: any = null;

    if (candidates.rows.length === 1) {
      matched = candidates.rows[0];
    } else if (candidates.rows.length > 1) {
      // 大会のメールパターンに合うものを選択
      if (has74) {
        matched = candidates.rows.find(c => String(c.contact_email || '').includes('74team'));
      } else if (has75) {
        matched = candidates.rows.find(c => String(c.contact_email || '').includes('75team'));
      }

      // rakusyo-go.comパターンで試す
      if (!matched) {
        const hasRakusyo = emails.some(e => e.includes('rakusyo-go.com'));
        if (hasRakusyo) {
          matched = candidates.rows.find(c => String(c.contact_email || '').includes('rakusyo-go.com'));
        } else {
          matched = candidates.rows.find(c => !String(c.contact_email || '').includes('rakusyo-go.com'));
        }
      }
    }

    if (matched) {
      await db.execute({
        sql: 'UPDATE t_tournament_teams SET team_id = ? WHERE tournament_team_id = ?',
        args: [matched.team_id, r.tournament_team_id]
      });
      console.log(`✓ tt_id=${r.tournament_team_id} "${r.team_name}" → ${matched.team_id} (${matched.contact_email})`);
    } else {
      console.log(`⚠️ tt_id=${r.tournament_team_id} "${r.team_name}" → マッチ不可`);
    }
  }

  // 最終確認
  const remaining = await db.execute('SELECT COUNT(*) as cnt FROM t_tournament_teams WHERE team_id NOT IN (SELECT team_id FROM m_teams)');
  console.log(`\n残り孤立: ${remaining.rows[0].cnt}件`);

  db.close();
}

main().catch(e => {
  console.error('❌ エラー:', e);
  process.exit(1);
});
