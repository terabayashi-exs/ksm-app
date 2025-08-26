#!/usr/bin/env node

/**
 * 既存の試合テンプレートにコート番号と時間を設定するスクリプト
 * 
 * 設定例:
 * - 予選は各ブロック別にコート固定
 * - 決勝戦など重要な試合は特定時間指定
 * - その他は自動計算（NULL）
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config({ path: '.env.local' });

// データベース接続設定
const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// コート・時間割り当て設定
const courtTimeSettings = {
  // 予選リーグ - ブロック別コート固定
  preliminary: {
    'A': { court: 1, startTime: null },  // Aブロック → コート1、時間は自動
    'B': { court: 2, startTime: null },  // Bブロック → コート2、時間は自動
    'C': { court: 3, startTime: null },  // Cブロック → コート3、時間は自動
    'D': { court: 4, startTime: null },  // Dブロック → コート4、時間は自動
  },
  // 決勝トーナメント - 重要試合は時間指定
  final: {
    'T7': { court: 1, startTime: '14:30' },  // 3位決定戦
    'T8': { court: 1, startTime: '15:00' },  // 決勝戦
    // その他の決勝戦は自動計算
    default: { court: null, startTime: null }
  }
};

async function updateTemplateCourtTime() {
  try {
    console.log('⚙️  試合テンプレートのコート・時間設定開始...');
    console.log('📍 接続先:', process.env.DATABASE_URL);
    console.log('');

    // 現在の試合テンプレートを取得
    const templates = await db.execute(`
      SELECT template_id, match_code, phase, block_name, court_number, suggested_start_time
      FROM m_match_templates 
      ORDER BY format_id, phase, match_number
    `);

    console.log(`📋 対象テンプレート: ${templates.rows.length}件`);
    console.log('');

    let updatedCount = 0;
    const updates = [];

    // 各テンプレートに対してコート・時間を設定
    for (const template of templates.rows) {
      const { template_id, match_code, phase, block_name } = template;
      let newCourt = null;
      let newTime = null;

      // フェーズ別の設定を適用
      if (phase === 'preliminary' && block_name) {
        // 予選リーグ - ブロック別コート設定
        const blockSettings = courtTimeSettings.preliminary[block_name];
        if (blockSettings) {
          newCourt = blockSettings.court;
          newTime = blockSettings.startTime;
        }
      } else if (phase === 'final') {
        // 決勝トーナメント - 試合コード別設定
        const finalSettings = courtTimeSettings.final[match_code] || 
                              courtTimeSettings.final.default;
        newCourt = finalSettings.court;
        newTime = finalSettings.startTime;
      }

      // 現在の値と異なる場合のみ更新
      const needsUpdate = 
        template.court_number !== newCourt || 
        template.suggested_start_time !== newTime;

      if (needsUpdate) {
        updates.push({
          template_id,
          match_code,
          phase,
          block_name: block_name || '—',
          oldCourt: template.court_number || 'NULL',
          newCourt: newCourt || 'NULL',
          oldTime: template.suggested_start_time || 'NULL',
          newTime: newTime || 'NULL'
        });
      }
    }

    // 更新予定の内容を表示
    console.log('📝 更新予定の内容:');
    if (updates.length === 0) {
      console.log('  更新が必要な項目はありません');
    } else {
      console.log(`  ${updates.length}件の更新を実行します:`);
      console.log('');
      
      updates.forEach(update => {
        console.log(`  🔄 ${update.match_code} (${update.phase}/${update.block_name})`);
        console.log(`     コート: ${update.oldCourt} → ${update.newCourt}`);
        console.log(`     時間: ${update.oldTime} → ${update.newTime}`);
        console.log('');
      });
    }

    // 実際に更新を実行
    for (const update of updates) {
      await db.execute(`
        UPDATE m_match_templates 
        SET court_number = ?, suggested_start_time = ?, updated_at = datetime('now', '+9 hours')
        WHERE template_id = ?
      `, [
        update.newCourt === 'NULL' ? null : update.newCourt,
        update.newTime === 'NULL' ? null : update.newTime,
        update.template_id
      ]);
      updatedCount++;
      console.log(`✅ ${update.match_code} を更新`);
    }

    // 更新後の確認
    console.log('');
    console.log('🎉 更新完了！');
    console.log(`📈 更新件数: ${updatedCount}件`);

    // 設定結果のサマリー表示
    console.log('');
    console.log('📊 設定結果サマリー:');
    
    const finalTemplates = await db.execute(`
      SELECT phase, block_name, match_code, court_number, suggested_start_time
      FROM m_match_templates 
      ORDER BY phase, block_name, match_number
    `);

    const summary = {
      preliminary: {},
      final: {}
    };

    finalTemplates.rows.forEach(template => {
      const phase = template.phase;
      const key = phase === 'preliminary' ? template.block_name : 'final';
      
      if (!summary[phase][key]) {
        summary[phase][key] = [];
      }
      
      summary[phase][key].push({
        match_code: template.match_code,
        court: template.court_number || 'AUTO',
        time: template.suggested_start_time || 'AUTO'
      });
    });

    // 予選リーグサマリー
    if (Object.keys(summary.preliminary).length > 0) {
      console.log('');
      console.log('📋 予選リーグ設定:');
      Object.entries(summary.preliminary).forEach(([block, matches]) => {
        if (block !== 'null' && matches.length > 0) {
          console.log(`  ${block}ブロック (${matches.length}試合):`);
          console.log(`    コート: ${matches[0].court}, 時間: ${matches[0].time}`);
        }
      });
    }

    // 決勝トーナメントサマリー
    if (Object.keys(summary.final).length > 0) {
      console.log('');
      console.log('📋 決勝トーナメント設定:');
      Object.entries(summary.final).forEach(([key, matches]) => {
        if (key === 'final' && matches.length > 0) {
          matches.forEach(match => {
            const status = (match.court !== 'AUTO' || match.time !== 'AUTO') ? '🎯 指定' : '🤖 自動';
            console.log(`    ${match.match_code}: コート${match.court}, ${match.time} ${status}`);
          });
        }
      });
    }

    console.log('');
    console.log('💡 設定内容:');
    console.log('  - Aブロック予選 → コート1、時間は自動計算');
    console.log('  - Bブロック予選 → コート2、時間は自動計算');
    console.log('  - Cブロック予選 → コート3、時間は自動計算');
    console.log('  - Dブロック予選 → コート4、時間は自動計算');
    console.log('  - T7（3位決定戦） → コート1、14:30固定');
    console.log('  - T8（決勝戦） → コート1、15:00固定');
    console.log('  - その他の決勝戦 → 自動計算');

    return {
      success: true,
      updatedCount,
      totalTemplates: templates.rows.length
    };

  } catch (error) {
    console.error('');
    console.error('💥 更新失敗:', error);
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('  1. m_match_templatesテーブルにcourt_numberとsuggested_start_timeカラムが存在するか確認');
    console.error('  2. データベースへの書き込み権限があるか確認');

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// スクリプトが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
  updateTemplateCourtTime()
    .then(result => {
      if (result.success) {
        console.log('\n🎊 テンプレート更新成功！');
        console.log(`📈 統計: ${result.updatedCount}/${result.totalTemplates}件を更新`);
        process.exit(0);
      } else {
        console.error('\n💀 テンプレート更新失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error);
      process.exit(1);
    });
}

export { updateTemplateCourtTime };