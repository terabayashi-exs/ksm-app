/**
 * テスト大会リセットスクリプト
 * 
 * 使用法:
 * node scripts/reset-test-tournaments.js [level] [tournament-ids]
 * 
 * 例:
 * node scripts/reset-test-tournaments.js level1 9,10,11
 * node scripts/reset-test-tournaments.js level2 9
 * node scripts/reset-test-tournaments.js level3 9,10,11 --force
 * 
 * レベル:
 * level1 - 試合結果のみリセット（チーム振り分け維持）
 * level2 - 組み合わせもリセット（チーム振り分けクリア）
 * level3 - 完全リセット（試合スケジュール削除）【危険】
 */

const fs = require('fs');
const path = require('path');

// 環境変数読み込み
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Turso接続設定
const { createClient } = require('@libsql/client');

const TEST_TOURNAMENT_IDS = [9, 10, 11];

const RESET_DESCRIPTIONS = {
  level1: '試合結果のみリセット（チーム振り分け維持）',
  level2: '組み合わせもリセット（チーム振り分けクリア）',
  level3: '完全リセット（試合スケジュール削除）【危険】'
};

class TournamentResetCLI {
  constructor() {
    // データベース接続
    this.db = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN
    });
  }

  /**
   * メイン実行関数
   */
  async run() {
    try {
      const args = process.argv.slice(2);
      
      if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        this.showHelp();
        return;
      }

      const level = args[0];
      const tournamentIdsArg = args[1];
      const isForceMode = args.includes('--force');

      // バリデーション
      if (!level || !['level1', 'level2', 'level3'].includes(level)) {
        console.error('❌ エラー: レベルは level1, level2, level3 のいずれかを指定してください');
        this.showHelp();
        return;
      }

      if (!tournamentIdsArg) {
        console.error('❌ エラー: 大会IDを指定してください');
        this.showHelp();
        return;
      }

      const tournamentIds = tournamentIdsArg.split(',').map(id => parseInt(id.trim()));
      
      // 大会ID検証
      const invalidIds = tournamentIds.filter(id => !TEST_TOURNAMENT_IDS.includes(id));
      if (invalidIds.length > 0) {
        console.error(`❌ エラー: 許可されていない大会ID: ${invalidIds.join(', ')}`);
        console.error(`   テスト用大会ID（${TEST_TOURNAMENT_IDS.join(', ')}）のみ許可されています`);
        return;
      }

      // 現在の状態確認
      console.log('🔍 現在の状態を確認中...');
      await this.showCurrentState(tournamentIds);

      // 確認プロセス
      if (!isForceMode) {
        console.log('\n⚠️  実行内容:');
        console.log(`   レベル: ${level} - ${RESET_DESCRIPTIONS[level]}`);
        console.log(`   対象大会: ${tournamentIds.join(', ')}`);
        
        if (level === 'level3') {
          console.log('\n🚨 警告: Level 3 は試合スケジュールを完全削除します！');
        }

        const confirmed = await this.askConfirmation('\n実行しますか？ (yes/no): ');
        if (!confirmed) {
          console.log('ℹ️  処理を中止しました');
          return;
        }
      }

      // リセット実行
      console.log('\n🔄 リセット処理を開始します...');
      const result = await this.executeReset(tournamentIds, level);

      if (result.success) {
        console.log('\n✅ リセット完了:');
        console.log(`   対象大会: ${result.details.tournaments_reset.join(', ')}`);
        console.log(`   リセットした試合: ${result.details.matches_reset}件`);
        console.log(`   クリアした結果: ${result.details.results_cleared}件`);
        console.log(`   適用レベル: ${result.details.level_applied}`);
      } else {
        console.error(`❌ リセット失敗: ${result.message}`);
        if (result.error) {
          console.error(`   エラー詳細: ${result.error}`);
        }
      }

    } catch (error) {
      console.error('❌ 予期しないエラーが発生しました:', error.message);
      process.exit(1);
    } finally {
      this.db.close();
    }
  }

  /**
   * 現在の状態表示
   */
  async showCurrentState(tournamentIds) {
    const tournamentIdList = tournamentIds.join(', ');
    
    const result = await this.db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.status,
        (SELECT COUNT(*) FROM t_tournament_teams WHERE tournament_id = t.tournament_id) as team_count,
        (SELECT COUNT(*) FROM t_tournament_teams WHERE tournament_id = t.tournament_id AND assigned_block IS NOT NULL) as assigned_team_count,
        (SELECT COUNT(*) FROM t_matches_live ml JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id WHERE mb.tournament_id = t.tournament_id) as match_count,
        (SELECT COUNT(*) FROM t_matches_final mf JOIN t_matches_live ml ON mf.match_id = ml.match_id JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id WHERE mb.tournament_id = t.tournament_id) as results_count
      FROM t_tournaments t
      WHERE tournament_id IN (${tournamentIdList})
      ORDER BY tournament_id
    `);

    console.log('\n📊 現在の状態:');
    console.log('─'.repeat(80));
    
    for (const row of result.rows) {
      console.log(`大会ID ${row.tournament_id}: ${row.tournament_name}`);
      console.log(`  ├─ 状態: ${row.status}`);
      console.log(`  ├─ 登録チーム: ${row.team_count}チーム`);
      console.log(`  ├─ 振り分け済み: ${row.assigned_team_count}/${row.team_count}チーム`);
      console.log(`  ├─ 生成済み試合: ${row.match_count}試合`);
      console.log(`  └─ 入力済み結果: ${row.results_count}結果`);
    }
    console.log('─'.repeat(80));
  }

  /**
   * リセット実行
   */
  async executeReset(tournamentIds, level) {
    const tournamentIdList = tournamentIds.join(', ');
    let matchesReset = 0;
    let resultsCleared = 0;

    try {
      if (level === 'level1') {
        // Level 1: 試合結果のみリセット
        
        // 確定済み試合結果を削除
        const deleteResult = await this.db.execute(`
          DELETE FROM t_matches_final 
          WHERE match_id IN (
            SELECT ml.match_id 
            FROM t_matches_live ml 
            JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
            WHERE mb.tournament_id IN (${tournamentIdList})
          )
        `);
        resultsCleared = deleteResult.rowsAffected || 0;

        // 試合状態リセット
        const resetResult = await this.db.execute(`
          UPDATE t_matches_live SET
            team1_scores = '[]',
            team2_scores = '[]', 
            winner_team_id = NULL,
            is_draw = 0,
            is_walkover = 0,
            match_status = 'scheduled',
            result_status = 'none',
            confirmed_by = NULL,
            remarks = NULL,
            updated_at = datetime('now', '+9 hours')
          WHERE match_block_id IN (
            SELECT mb.match_block_id 
            FROM t_match_blocks mb 
            WHERE mb.tournament_id IN (${tournamentIdList})
          )
        `);
        matchesReset = resetResult.rowsAffected || 0;

        // ブロック順位表クリア
        await this.db.execute(`
          UPDATE t_match_blocks SET
            team_rankings = NULL,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_id IN (${tournamentIdList})
        `);

        // 試合状態履歴削除
        await this.db.execute(`
          DELETE FROM t_match_status 
          WHERE match_id IN (
            SELECT ml.match_id 
            FROM t_matches_live ml 
            JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id 
            WHERE mb.tournament_id IN (${tournamentIdList})
          )
        `);

      } else if (level === 'level2') {
        // Level 2: 組み合わせもリセット
        
        // Level 1の処理を先に実行
        const level1Result = await this.executeReset(tournamentIds, 'level1');
        matchesReset = level1Result.details.matches_reset;
        resultsCleared = level1Result.details.results_cleared;

        // チーム振り分けクリア
        await this.db.execute(`
          UPDATE t_tournament_teams SET
            assigned_block = NULL,
            block_position = NULL,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_id IN (${tournamentIdList})
        `);

        // 試合のチーム割り当てクリア
        await this.db.execute(`
          UPDATE t_matches_live SET
            team1_id = NULL,
            team2_id = NULL,
            updated_at = datetime('now', '+9 hours')
          WHERE match_block_id IN (
            SELECT mb.match_block_id 
            FROM t_match_blocks mb 
            WHERE mb.tournament_id IN (${tournamentIdList})
          )
        `);

      } else if (level === 'level3') {
        // Level 3: 完全リセット
        
        // Level 2の処理を先に実行
        const level2Result = await this.executeReset(tournamentIds, 'level2');
        matchesReset = level2Result.details.matches_reset;
        resultsCleared = level2Result.details.results_cleared;

        // 試合スケジュール削除
        await this.db.execute(`
          DELETE FROM t_matches_live 
          WHERE match_block_id IN (
            SELECT mb.match_block_id 
            FROM t_match_blocks mb 
            WHERE mb.tournament_id IN (${tournamentIdList})
          )
        `);

        // ブロック削除
        await this.db.execute(`
          DELETE FROM t_match_blocks 
          WHERE tournament_id IN (${tournamentIdList})
        `);
      }

      return {
        success: true,
        message: `${RESET_DESCRIPTIONS[level]}が完了しました`,
        details: {
          tournaments_reset: tournamentIds,
          matches_reset: matchesReset,
          results_cleared: resultsCleared,
          level_applied: level
        }
      };

    } catch (error) {
      return {
        success: false,
        message: 'リセット処理中にエラーが発生しました',
        error: error.message
      };
    }
  }

  /**
   * 確認入力
   */
  askConfirmation(question) {
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  /**
   * ヘルプ表示
   */
  showHelp() {
    console.log(`
📖 テスト大会リセットスクリプト

使用法:
  node scripts/reset-test-tournaments.js [level] [tournament-ids] [options]

レベル:
  level1    ${RESET_DESCRIPTIONS.level1}
  level2    ${RESET_DESCRIPTIONS.level2} 
  level3    ${RESET_DESCRIPTIONS.level3}

大会ID:
  対象大会IDをカンマ区切りで指定 (例: 9,10,11)
  許可される大会ID: ${TEST_TOURNAMENT_IDS.join(', ')}

オプション:
  --force   確認なしで実行
  --help    このヘルプを表示

実行例:
  node scripts/reset-test-tournaments.js level1 9,10,11
  node scripts/reset-test-tournaments.js level2 9 --force
  node scripts/reset-test-tournaments.js level3 9,10,11

⚠️  注意:
- Level 3 は試合スケジュールを完全削除するため注意が必要です
- テスト用大会 (${TEST_TOURNAMENT_IDS.join(', ')}) のみリセット可能です
- 実行前に現在の状態が表示されます
`);
  }
}

// スクリプト実行
if (require.main === module) {
  const cli = new TournamentResetCLI();
  cli.run().catch(error => {
    console.error('❌ 実行エラー:', error);
    process.exit(1);
  });
}

module.exports = TournamentResetCLI;