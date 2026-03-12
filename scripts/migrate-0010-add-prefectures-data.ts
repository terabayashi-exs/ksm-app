/**
 * マイグレーション0010: 都道府県マスタデータの登録
 *
 * このスクリプトは環境を指定して実行します（dev/stag/main）
 *
 * 実行例:
 *   npx tsx scripts/migrate-0010-add-prefectures-data.ts stag
 *   npx tsx scripts/migrate-0010-add-prefectures-data.ts main
 */

import { config } from 'dotenv';
import { createClient } from '@libsql/client';

config({ path: '.env.local' });

// 都道府県マスタデータ（47都道府県）
const prefecturesData = [
  { prefecture_id: 1, prefecture_name: '北海道', prefecture_code: '01', region_name: '北海道', display_order: 1, is_active: 1 },
  { prefecture_id: 2, prefecture_name: '青森県', prefecture_code: '02', region_name: '東北', display_order: 2, is_active: 1 },
  { prefecture_id: 3, prefecture_name: '岩手県', prefecture_code: '03', region_name: '東北', display_order: 3, is_active: 1 },
  { prefecture_id: 4, prefecture_name: '宮城県', prefecture_code: '04', region_name: '東北', display_order: 4, is_active: 1 },
  { prefecture_id: 5, prefecture_name: '秋田県', prefecture_code: '05', region_name: '東北', display_order: 5, is_active: 1 },
  { prefecture_id: 6, prefecture_name: '山形県', prefecture_code: '06', region_name: '東北', display_order: 6, is_active: 1 },
  { prefecture_id: 7, prefecture_name: '福島県', prefecture_code: '07', region_name: '東北', display_order: 7, is_active: 1 },
  { prefecture_id: 8, prefecture_name: '茨城県', prefecture_code: '08', region_name: '関東', display_order: 8, is_active: 1 },
  { prefecture_id: 9, prefecture_name: '栃木県', prefecture_code: '09', region_name: '関東', display_order: 9, is_active: 1 },
  { prefecture_id: 10, prefecture_name: '群馬県', prefecture_code: '10', region_name: '関東', display_order: 10, is_active: 1 },
  { prefecture_id: 11, prefecture_name: '埼玉県', prefecture_code: '11', region_name: '関東', display_order: 11, is_active: 1 },
  { prefecture_id: 12, prefecture_name: '千葉県', prefecture_code: '12', region_name: '関東', display_order: 12, is_active: 1 },
  { prefecture_id: 13, prefecture_name: '東京都', prefecture_code: '13', region_name: '関東', display_order: 13, is_active: 1 },
  { prefecture_id: 14, prefecture_name: '神奈川県', prefecture_code: '14', region_name: '関東', display_order: 14, is_active: 1 },
  { prefecture_id: 15, prefecture_name: '新潟県', prefecture_code: '15', region_name: '中部', display_order: 15, is_active: 1 },
  { prefecture_id: 16, prefecture_name: '富山県', prefecture_code: '16', region_name: '中部', display_order: 16, is_active: 1 },
  { prefecture_id: 17, prefecture_name: '石川県', prefecture_code: '17', region_name: '中部', display_order: 17, is_active: 1 },
  { prefecture_id: 18, prefecture_name: '福井県', prefecture_code: '18', region_name: '中部', display_order: 18, is_active: 1 },
  { prefecture_id: 19, prefecture_name: '山梨県', prefecture_code: '19', region_name: '中部', display_order: 19, is_active: 1 },
  { prefecture_id: 20, prefecture_name: '長野県', prefecture_code: '20', region_name: '中部', display_order: 20, is_active: 1 },
  { prefecture_id: 21, prefecture_name: '岐阜県', prefecture_code: '21', region_name: '中部', display_order: 21, is_active: 1 },
  { prefecture_id: 22, prefecture_name: '静岡県', prefecture_code: '22', region_name: '中部', display_order: 22, is_active: 1 },
  { prefecture_id: 23, prefecture_name: '愛知県', prefecture_code: '23', region_name: '中部', display_order: 23, is_active: 1 },
  { prefecture_id: 24, prefecture_name: '三重県', prefecture_code: '24', region_name: '近畿', display_order: 24, is_active: 1 },
  { prefecture_id: 25, prefecture_name: '滋賀県', prefecture_code: '25', region_name: '近畿', display_order: 25, is_active: 1 },
  { prefecture_id: 26, prefecture_name: '京都府', prefecture_code: '26', region_name: '近畿', display_order: 26, is_active: 1 },
  { prefecture_id: 27, prefecture_name: '大阪府', prefecture_code: '27', region_name: '近畿', display_order: 27, is_active: 1 },
  { prefecture_id: 28, prefecture_name: '兵庫県', prefecture_code: '28', region_name: '近畿', display_order: 28, is_active: 1 },
  { prefecture_id: 29, prefecture_name: '奈良県', prefecture_code: '29', region_name: '近畿', display_order: 29, is_active: 1 },
  { prefecture_id: 30, prefecture_name: '和歌山県', prefecture_code: '30', region_name: '近畿', display_order: 30, is_active: 1 },
  { prefecture_id: 31, prefecture_name: '鳥取県', prefecture_code: '31', region_name: '中国', display_order: 31, is_active: 1 },
  { prefecture_id: 32, prefecture_name: '島根県', prefecture_code: '32', region_name: '中国', display_order: 32, is_active: 1 },
  { prefecture_id: 33, prefecture_name: '岡山県', prefecture_code: '33', region_name: '中国', display_order: 33, is_active: 1 },
  { prefecture_id: 34, prefecture_name: '広島県', prefecture_code: '34', region_name: '中国', display_order: 34, is_active: 1 },
  { prefecture_id: 35, prefecture_name: '山口県', prefecture_code: '35', region_name: '中国', display_order: 35, is_active: 1 },
  { prefecture_id: 36, prefecture_name: '徳島県', prefecture_code: '36', region_name: '四国', display_order: 36, is_active: 1 },
  { prefecture_id: 37, prefecture_name: '香川県', prefecture_code: '37', region_name: '四国', display_order: 37, is_active: 1 },
  { prefecture_id: 38, prefecture_name: '愛媛県', prefecture_code: '38', region_name: '四国', display_order: 38, is_active: 1 },
  { prefecture_id: 39, prefecture_name: '高知県', prefecture_code: '39', region_name: '四国', display_order: 39, is_active: 1 },
  { prefecture_id: 40, prefecture_name: '福岡県', prefecture_code: '40', region_name: '九州・沖縄', display_order: 40, is_active: 1 },
  { prefecture_id: 41, prefecture_name: '佐賀県', prefecture_code: '41', region_name: '九州・沖縄', display_order: 41, is_active: 1 },
  { prefecture_id: 42, prefecture_name: '長崎県', prefecture_code: '42', region_name: '九州・沖縄', display_order: 42, is_active: 1 },
  { prefecture_id: 43, prefecture_name: '熊本県', prefecture_code: '43', region_name: '九州・沖縄', display_order: 43, is_active: 1 },
  { prefecture_id: 44, prefecture_name: '大分県', prefecture_code: '44', region_name: '九州・沖縄', display_order: 44, is_active: 1 },
  { prefecture_id: 45, prefecture_name: '宮崎県', prefecture_code: '45', region_name: '九州・沖縄', display_order: 45, is_active: 1 },
  { prefecture_id: 46, prefecture_name: '鹿児島県', prefecture_code: '46', region_name: '九州・沖縄', display_order: 46, is_active: 1 },
  { prefecture_id: 47, prefecture_name: '沖縄県', prefecture_code: '47', region_name: '九州・沖縄', display_order: 47, is_active: 1 },
];

// 環境設定の取得
function getEnvironmentConfig(env: string) {
  const envUpper = env.toUpperCase();
  const url = process.env[`DATABASE_URL_${envUpper}`] || process.env.DATABASE_URL;
  const token = process.env[`DATABASE_AUTH_TOKEN_${envUpper}`] || process.env.DATABASE_AUTH_TOKEN;

  if (!url || !token) {
    throw new Error(`環境変数が設定されていません: ${env}`);
  }

  return { url, token };
}

async function migratePrefectures(env: string) {
  const { url, token } = getEnvironmentConfig(env);
  const client = createClient({ url, authToken: token });

  try {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  都道府県マスタデータ登録 (${env}環境)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 現在のレコード数を確認
    const countResult = await client.execute(
      'SELECT COUNT(*) as count FROM m_prefectures'
    );
    const currentCount = Number(countResult.rows[0].count);

    console.log(`現在のレコード数: ${currentCount}件`);

    if (currentCount > 0) {
      console.log('⚠️  既にデータが存在します。');
      console.log('既存データを削除してから登録しますか？ (y/N): ');
      // 自動的に既存データをスキップする
      console.log('既存データが存在するため、スキップします。\n');
      return;
    }

    // データ登録
    console.log(`\n${prefecturesData.length}件のデータを登録中...\n`);

    let insertedCount = 0;
    for (const pref of prefecturesData) {
      try {
        await client.execute({
          sql: `
            INSERT INTO m_prefectures (
              prefecture_id,
              prefecture_name,
              prefecture_code,
              region_name,
              display_order,
              is_active,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'))
          `,
          args: [
            pref.prefecture_id,
            pref.prefecture_name,
            pref.prefecture_code,
            pref.region_name,
            pref.display_order,
            pref.is_active,
          ],
        });
        insertedCount++;
        if (insertedCount % 10 === 0) {
          console.log(`  ${insertedCount}件登録完了...`);
        }
      } catch (error: any) {
        if (error.message?.includes('UNIQUE constraint failed')) {
          console.log(`  ⊘ スキップ（既存）: ${pref.prefecture_name}`);
        } else {
          console.error(`  ✗ エラー (${pref.prefecture_name}):`, error.message);
        }
      }
    }

    console.log(`\n✅ ${insertedCount}件のデータを登録しました\n`);

    // 登録後の確認
    const finalCountResult = await client.execute(
      'SELECT COUNT(*) as count FROM m_prefectures'
    );
    console.log(`最終レコード数: ${finalCountResult.rows[0].count}件`);

    // サンプルデータ表示
    const sampleResult = await client.execute(`
      SELECT prefecture_id, prefecture_name, region_name
      FROM m_prefectures
      ORDER BY display_order
      LIMIT 5
    `);

    console.log('\nサンプルデータ（最初の5件）:');
    sampleResult.rows.forEach((row: any) => {
      console.log(`  ${row.prefecture_id}: ${row.prefecture_name} (${row.region_name})`);
    });

  } catch (error) {
    console.error('エラー:', error);
    throw error;
  } finally {
    client.close();
  }
}

// メイン処理
const env = process.argv[2] || 'dev';

if (!['dev', 'stag', 'main'].includes(env)) {
  console.error('エラー: 環境は dev, stag, main のいずれかを指定してください');
  console.error('使用例: npx tsx scripts/migrate-0010-add-prefectures-data.ts stag');
  process.exit(1);
}

migratePrefectures(env).catch((error) => {
  console.error('マイグレーション失敗:', error);
  process.exit(1);
});
