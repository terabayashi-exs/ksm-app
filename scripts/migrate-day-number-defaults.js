// scripts/migrate-day-number-defaults.js
// m_match_templatesテーブルのday_numberフィールドに0やNULLがあれば1に更新する

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

async function migrateDayNumbers() {
  console.log('🔍 既存のday_numberデータを確認中...');

  try {
    // 現在のday_numberの状態を確認
    const checkResult = await db.execute(`
      SELECT
        template_id,
        match_code,
        day_number,
        CASE
          WHEN day_number IS NULL THEN 'NULL'
          WHEN day_number = 0 THEN 'ZERO'
          WHEN day_number < 1 THEN 'INVALID'
          ELSE 'OK'
        END as status
      FROM m_match_templates
      ORDER BY template_id
    `);

    console.log(`\n📊 全テンプレート数: ${checkResult.rows.length}`);

    const needsUpdate = checkResult.rows.filter(row => row.status !== 'OK');

    if (needsUpdate.length === 0) {
      console.log('✅ すべてのday_numberデータは正常です（1以上の値が設定されています）');
      return;
    }

    console.log(`\n⚠️  修正が必要なレコード数: ${needsUpdate.length}`);
    console.log('\n修正が必要なデータ:');
    needsUpdate.forEach(row => {
      console.log(`  - template_id: ${row.template_id}, match_code: ${row.match_code}, day_number: ${row.day_number} (${row.status})`);
    });

    // 確認メッセージ
    console.log('\n🔧 これらのday_numberを1に更新します...');

    // NULLまたは0または1未満のday_numberを1に更新
    const updateResult = await db.execute(`
      UPDATE m_match_templates
      SET day_number = 1
      WHERE day_number IS NULL OR day_number < 1
    `);

    console.log(`\n✅ ${updateResult.rowsAffected || needsUpdate.length}件のレコードを更新しました`);

    // 更新後の確認
    const verifyResult = await db.execute(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN day_number >= 1 THEN 1 END) as valid_count,
        COUNT(CASE WHEN day_number IS NULL OR day_number < 1 THEN 1 END) as invalid_count
      FROM m_match_templates
    `);

    const stats = verifyResult.rows[0];
    console.log('\n📊 更新後の統計:');
    console.log(`  - 全レコード数: ${stats.total}`);
    console.log(`  - 正常なday_number: ${stats.valid_count}`);
    console.log(`  - 無効なday_number: ${stats.invalid_count}`);

    if (stats.invalid_count === 0) {
      console.log('\n✅ マイグレーション完了！すべてのday_numberが正常です。');
    } else {
      console.log('\n⚠️  一部のレコードがまだ無効です。手動での確認が必要です。');
    }

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// 実行
migrateDayNumbers()
  .then(() => {
    console.log('\n✅ スクリプト完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ スクリプト失敗:', error);
    process.exit(1);
  });
