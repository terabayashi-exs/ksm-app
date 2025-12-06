#!/usr/bin/env node

/**
 * 部門74 予選Bブロックの不戦勝試合を中止扱いに変更
 *
 * 変更内容:
 * - is_walkover: 1 → 0
 * - winner_team_id: (値) → NULL
 * - is_draw: 0 のまま
 * - cancellation_type を設定（t_matches_liveのみ、t_matches_finalにはこのフィールドがない可能性）
 *
 * 注意: 試合数や勝点の再計算は行いません
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function changeWalkoverToCancelled() {
  try {
    console.log('\n=== 部門74 予選Bブロックの不戦勝試合を中止扱いに変更 ===\n');

    // 1. t_matches_finalの不戦勝試合を取得
    const finalMatches = await db.execute(`
      SELECT
        mf.match_id,
        mf.match_code,
        mf.team1_display_name,
        mf.team2_display_name,
        mf.is_walkover,
        mf.winner_team_id
      FROM t_matches_final mf
      INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 74
        AND mb.block_name = 'B'
        AND mb.phase = 'preliminary'
        AND mf.is_walkover = 1
      ORDER BY mf.match_code
    `);

    console.log(`対象試合数（t_matches_final）: ${finalMatches.rows.length}\n`);

    let finalUpdatedCount = 0;
    for (const match of finalMatches.rows) {
      await db.execute(`
        UPDATE t_matches_final
        SET is_walkover = 0,
            winner_team_id = NULL,
            updated_at = datetime('now', '+9 hours')
        WHERE match_id = ?
      `, [match.match_id]);

      console.log(`✓ [${match.match_code}] ${match.team1_display_name} vs ${match.team2_display_name}`);
      console.log(`  is_walkover: 1 → 0, winner_team_id: ${match.winner_team_id} → NULL\n`);
      finalUpdatedCount++;
    }

    console.log(`✅ t_matches_final: ${finalUpdatedCount}件を中止扱いに変更しました\n`);

    // 2. t_matches_liveの不戦勝試合も確認（念のため）
    const liveMatches = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.is_walkover,
        ml.winner_team_id,
        ml.cancellation_type
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = 74
        AND mb.block_name = 'B'
        AND mb.phase = 'preliminary'
        AND ml.is_walkover = 1
      ORDER BY ml.match_code
    `);

    if (liveMatches.rows.length > 0) {
      console.log(`\n対象試合数（t_matches_live）: ${liveMatches.rows.length}\n`);

      let liveUpdatedCount = 0;
      for (const match of liveMatches.rows) {
        // t_matches_liveではcancellation_typeも設定
        await db.execute(`
          UPDATE t_matches_live
          SET is_walkover = 0,
              winner_team_id = NULL,
              cancellation_type = 'cancelled',
              updated_at = datetime('now', '+9 hours')
          WHERE match_id = ?
        `, [match.match_id]);

        console.log(`✓ [${match.match_code}] ${match.team1_display_name} vs ${match.team2_display_name}`);
        console.log(`  is_walkover: 1 → 0, winner_team_id: ${match.winner_team_id} → NULL`);
        console.log(`  cancellation_type: ${match.cancellation_type || 'NULL'} → 'cancelled'\n`);
        liveUpdatedCount++;
      }

      console.log(`✅ t_matches_live: ${liveUpdatedCount}件を中止扱いに変更しました\n`);
    } else {
      console.log('t_matches_liveに不戦勝試合はありません\n');
    }

    console.log('✅ 完了: 不戦勝試合を中止扱いに変更しました');
    console.log('※ 試合数や勝点の再計算は行っていません\n');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    db.close();
  }
}

changeWalkoverToCancelled();
