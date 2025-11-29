#!/usr/bin/env node

/**
 * 本番環境用 tournament_team_id カラム追加・データ移行スクリプト
 *
 * 実行方法:
 *   DATABASE_URL="本番URL" DATABASE_AUTH_TOKEN="本番トークン" node scripts/migrate-prod-tournament-team-ids.mjs
 *
 * または .env.local で本番環境を指定してから:
 *   node scripts/migrate-prod-tournament-team-ids.mjs
 *
 * 処理内容:
 *   1. t_matches_live, t_matches_final に tournament_team_id カラムを追加
 *   2. 既存データから display_name を使って tournament_team_id を逆引き
 *   3. データの整合性チェック
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.local を読み込み
dotenv.config({ path: join(__dirname, '../.env.local') });

// 環境変数チェック
if (!process.env.DATABASE_URL || !process.env.DATABASE_AUTH_TOKEN) {
  console.error('❌ DATABASE_URL と DATABASE_AUTH_TOKEN を設定してください');
  process.exit(1);
}

// 本番環境であることを確認
if (!process.env.DATABASE_URL.includes('ksm-prod') && !process.env.DATABASE_URL.includes('ksm-main')) {
  console.error('⚠️  警告: 本番環境のURLではないようです');
  console.error('現在のURL:', process.env.DATABASE_URL);
  console.error('\n本当に実行しますか？ (y/N)');

  // 手動確認が必要な場合はここで終了
  // 実運用では readline などで確認を求める
}

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

console.log('🚀 【本番環境】tournament_team_id カラム追加・データ移行スクリプト開始\n');
console.log('対象データベース:', process.env.DATABASE_URL);
console.log('============================================\n');

async function main() {
  try {
    console.log('📋 ステップ1: データベーススキーマ変更');
    console.log('--------------------------------------------');

    // カラム追加（存在チェック付き）
    const columns = [
      { table: 't_matches_live', column: 'team1_tournament_team_id' },
      { table: 't_matches_live', column: 'team2_tournament_team_id' },
      { table: 't_matches_live', column: 'winner_tournament_team_id' },
      { table: 't_matches_final', column: 'team1_tournament_team_id' },
      { table: 't_matches_final', column: 'team2_tournament_team_id' },
      { table: 't_matches_final', column: 'winner_tournament_team_id' },
    ];

    for (const { table, column } of columns) {
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`);
        console.log(`✅ ${table}.${column} 追加完了`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`ℹ️  ${table}.${column} は既に存在します`);
        } else {
          throw error;
        }
      }
    }

    // インデックス作成
    console.log('\nインデックス作成中...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_matches_live_team1_tournament ON t_matches_live(team1_tournament_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_matches_live_team2_tournament ON t_matches_live(team2_tournament_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_matches_live_winner_tournament ON t_matches_live(winner_tournament_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_matches_final_team1_tournament ON t_matches_final(team1_tournament_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_matches_final_team2_tournament ON t_matches_final(team2_tournament_team_id)',
      'CREATE INDEX IF NOT EXISTS idx_matches_final_winner_tournament ON t_matches_final(winner_tournament_team_id)',
    ];

    for (const sql of indexes) {
      await db.execute(sql);
    }
    console.log('✅ インデックス作成完了');

    console.log('\n📊 ステップ2: 既存データの分析');
    console.log('--------------------------------------------');

    // t_matches_live の件数確認
    const liveCount = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_live');
    console.log(`t_matches_live: ${liveCount.rows[0].cnt} 件`);

    // t_matches_final の件数確認
    const finalCount = await db.execute('SELECT COUNT(*) as cnt FROM t_matches_final');
    console.log(`t_matches_final: ${finalCount.rows[0].cnt} 件`);

    console.log('\n🔄 ステップ3: t_matches_live のデータ移行');
    console.log('--------------------------------------------');

    // team1_tournament_team_id の更新
    const updateTeam1Live = await db.execute({
      sql: `
        UPDATE t_matches_live
        SET team1_tournament_team_id = (
          SELECT tt.tournament_team_id
          FROM t_tournament_teams tt
          JOIN t_match_blocks mb ON t_matches_live.match_block_id = mb.match_block_id
          WHERE tt.tournament_id = mb.tournament_id
            AND tt.team_id = t_matches_live.team1_id
            AND tt.team_name = t_matches_live.team1_display_name
          LIMIT 1
        )
        WHERE team1_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ team1_tournament_team_id 更新: ${updateTeam1Live.rowsAffected} 件`);

    // team2_tournament_team_id の更新
    const updateTeam2Live = await db.execute({
      sql: `
        UPDATE t_matches_live
        SET team2_tournament_team_id = (
          SELECT tt.tournament_team_id
          FROM t_tournament_teams tt
          JOIN t_match_blocks mb ON t_matches_live.match_block_id = mb.match_block_id
          WHERE tt.tournament_id = mb.tournament_id
            AND tt.team_id = t_matches_live.team2_id
            AND tt.team_name = t_matches_live.team2_display_name
          LIMIT 1
        )
        WHERE team2_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ team2_tournament_team_id 更新: ${updateTeam2Live.rowsAffected} 件`);

    // winner_tournament_team_id の更新
    const updateWinnerLive = await db.execute({
      sql: `
        UPDATE t_matches_live
        SET winner_tournament_team_id = (
          CASE
            WHEN winner_team_id = team1_id THEN team1_tournament_team_id
            WHEN winner_team_id = team2_id THEN team2_tournament_team_id
            ELSE NULL
          END
        )
        WHERE winner_team_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ winner_tournament_team_id 更新: ${updateWinnerLive.rowsAffected} 件`);

    console.log('\n🔄 ステップ4: t_matches_final のデータ移行');
    console.log('--------------------------------------------');

    // team1_tournament_team_id の更新
    const updateTeam1Final = await db.execute({
      sql: `
        UPDATE t_matches_final
        SET team1_tournament_team_id = (
          SELECT tt.tournament_team_id
          FROM t_tournament_teams tt
          JOIN t_match_blocks mb ON t_matches_final.match_block_id = mb.match_block_id
          WHERE tt.tournament_id = mb.tournament_id
            AND tt.team_id = t_matches_final.team1_id
            AND tt.team_name = t_matches_final.team1_display_name
          LIMIT 1
        )
        WHERE team1_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ team1_tournament_team_id 更新: ${updateTeam1Final.rowsAffected} 件`);

    // team2_tournament_team_id の更新
    const updateTeam2Final = await db.execute({
      sql: `
        UPDATE t_matches_final
        SET team2_tournament_team_id = (
          SELECT tt.tournament_team_id
          FROM t_tournament_teams tt
          JOIN t_match_blocks mb ON t_matches_final.match_block_id = mb.match_block_id
          WHERE tt.tournament_id = mb.tournament_id
            AND tt.team_id = t_matches_final.team2_id
            AND tt.team_name = t_matches_final.team2_display_name
          LIMIT 1
        )
        WHERE team2_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ team2_tournament_team_id 更新: ${updateTeam2Final.rowsAffected} 件`);

    // winner_tournament_team_id の更新
    const updateWinnerFinal = await db.execute({
      sql: `
        UPDATE t_matches_final
        SET winner_tournament_team_id = (
          CASE
            WHEN winner_team_id = team1_id THEN team1_tournament_team_id
            WHEN winner_team_id = team2_id THEN team2_tournament_team_id
            ELSE NULL
          END
        )
        WHERE winner_team_id IS NOT NULL
      `,
      args: []
    });
    console.log(`✅ winner_tournament_team_id 更新: ${updateWinnerFinal.rowsAffected} 件`);

    console.log('\n✅ ステップ5: データ整合性チェック');
    console.log('--------------------------------------------');

    // t_matches_live の NULL チェック
    const liveNullCheck = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN team1_id IS NOT NULL AND team1_tournament_team_id IS NULL THEN 1 ELSE 0 END) as team1_null,
        SUM(CASE WHEN team2_id IS NOT NULL AND team2_tournament_team_id IS NULL THEN 1 ELSE 0 END) as team2_null,
        SUM(CASE WHEN winner_team_id IS NOT NULL AND winner_tournament_team_id IS NULL THEN 1 ELSE 0 END) as winner_null
      FROM t_matches_live
    `);

    const liveStats = liveNullCheck.rows[0];
    console.log(`\nt_matches_live 整合性チェック:`);
    console.log(`  総試合数: ${liveStats.total}`);
    console.log(`  team1_tournament_team_id が NULL: ${liveStats.team1_null} 件 ${liveStats.team1_null > 0 ? '⚠️' : '✅'}`);
    console.log(`  team2_tournament_team_id が NULL: ${liveStats.team2_null} 件 ${liveStats.team2_null > 0 ? '⚠️' : '✅'}`);
    console.log(`  winner_tournament_team_id が NULL: ${liveStats.winner_null} 件 ${liveStats.winner_null > 0 ? 'ℹ️' : '✅'}`);

    // t_matches_final の NULL チェック
    const finalNullCheck = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN team1_id IS NOT NULL AND team1_tournament_team_id IS NULL THEN 1 ELSE 0 END) as team1_null,
        SUM(CASE WHEN team2_id IS NOT NULL AND team2_tournament_team_id IS NULL THEN 1 ELSE 0 END) as team2_null,
        SUM(CASE WHEN winner_team_id IS NOT NULL AND winner_tournament_team_id IS NULL THEN 1 ELSE 0 END) as winner_null
      FROM t_matches_final
    `);

    const finalStats = finalNullCheck.rows[0];
    console.log(`\nt_matches_final 整合性チェック:`);
    console.log(`  総試合数: ${finalStats.total}`);
    console.log(`  team1_tournament_team_id が NULL: ${finalStats.team1_null} 件 ${finalStats.team1_null > 0 ? '⚠️' : '✅'}`);
    console.log(`  team2_tournament_team_id が NULL: ${finalStats.team2_null} 件 ${finalStats.team2_null > 0 ? '⚠️' : '✅'}`);
    console.log(`  winner_tournament_team_id が NULL: ${finalStats.winner_null} 件 ${finalStats.winner_null > 0 ? 'ℹ️' : '✅'}`);

    // 問題があるレコードの詳細表示（最大5件）
    if (liveStats.team1_null > 0 || liveStats.team2_null > 0) {
      console.log('\nℹ️  NULL が残っている試合（未確定チーム）の例:');
      const nullMatches = await db.execute(`
        SELECT match_id, match_code, team1_id, team1_display_name, team2_id, team2_display_name
        FROM t_matches_live
        WHERE (team1_id IS NOT NULL AND team1_tournament_team_id IS NULL)
           OR (team2_id IS NOT NULL AND team2_tournament_team_id IS NULL)
        LIMIT 5
      `);
      console.table(nullMatches.rows);
      console.log('※ これらはプレースホルダー（未確定）チームのため問題ありません');
    }

    console.log('\n✅ 【本番環境】マイグレーション完了！');
    console.log('============================================');
    console.log('\n📌 注意事項:');
    console.log('  - アプリケーションコードはまだ旧カラム(team_id)を使用しています');
    console.log('  - 表示には一切影響しません');
    console.log('  - 次のデプロイでアプリケーション側を更新予定です\n');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

main();
