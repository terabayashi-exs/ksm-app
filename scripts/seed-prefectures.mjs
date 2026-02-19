import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL || '',
  authToken: process.env.DATABASE_AUTH_TOKEN || '',
});

const prefectures = [
  // 北海道
  { id: 1, code: '01', name: '北海道', region: '北海道', order: 1 },

  // 東北
  { id: 2, code: '02', name: '青森県', region: '東北', order: 2 },
  { id: 3, code: '03', name: '岩手県', region: '東北', order: 3 },
  { id: 4, code: '04', name: '宮城県', region: '東北', order: 4 },
  { id: 5, code: '05', name: '秋田県', region: '東北', order: 5 },
  { id: 6, code: '06', name: '山形県', region: '東北', order: 6 },
  { id: 7, code: '07', name: '福島県', region: '東北', order: 7 },

  // 関東
  { id: 8, code: '08', name: '茨城県', region: '関東', order: 8 },
  { id: 9, code: '09', name: '栃木県', region: '関東', order: 9 },
  { id: 10, code: '10', name: '群馬県', region: '関東', order: 10 },
  { id: 11, code: '11', name: '埼玉県', region: '関東', order: 11 },
  { id: 12, code: '12', name: '千葉県', region: '関東', order: 12 },
  { id: 13, code: '13', name: '東京都', region: '関東', order: 13 },
  { id: 14, code: '14', name: '神奈川県', region: '関東', order: 14 },

  // 中部
  { id: 15, code: '15', name: '新潟県', region: '中部', order: 15 },
  { id: 16, code: '16', name: '富山県', region: '中部', order: 16 },
  { id: 17, code: '17', name: '石川県', region: '中部', order: 17 },
  { id: 18, code: '18', name: '福井県', region: '中部', order: 18 },
  { id: 19, code: '19', name: '山梨県', region: '中部', order: 19 },
  { id: 20, code: '20', name: '長野県', region: '中部', order: 20 },
  { id: 21, code: '21', name: '岐阜県', region: '中部', order: 21 },
  { id: 22, code: '22', name: '静岡県', region: '中部', order: 22 },
  { id: 23, code: '23', name: '愛知県', region: '中部', order: 23 },

  // 近畿
  { id: 24, code: '24', name: '三重県', region: '近畿', order: 24 },
  { id: 25, code: '25', name: '滋賀県', region: '近畿', order: 25 },
  { id: 26, code: '26', name: '京都府', region: '近畿', order: 26 },
  { id: 27, code: '27', name: '大阪府', region: '近畿', order: 27 },
  { id: 28, code: '28', name: '兵庫県', region: '近畿', order: 28 },
  { id: 29, code: '29', name: '奈良県', region: '近畿', order: 29 },
  { id: 30, code: '30', name: '和歌山県', region: '近畿', order: 30 },

  // 中国
  { id: 31, code: '31', name: '鳥取県', region: '中国', order: 31 },
  { id: 32, code: '32', name: '島根県', region: '中国', order: 32 },
  { id: 33, code: '33', name: '岡山県', region: '中国', order: 33 },
  { id: 34, code: '34', name: '広島県', region: '中国', order: 34 },
  { id: 35, code: '35', name: '山口県', region: '中国', order: 35 },

  // 四国
  { id: 36, code: '36', name: '徳島県', region: '四国', order: 36 },
  { id: 37, code: '37', name: '香川県', region: '四国', order: 37 },
  { id: 38, code: '38', name: '愛媛県', region: '四国', order: 38 },
  { id: 39, code: '39', name: '高知県', region: '四国', order: 39 },

  // 九州・沖縄
  { id: 40, code: '40', name: '福岡県', region: '九州・沖縄', order: 40 },
  { id: 41, code: '41', name: '佐賀県', region: '九州・沖縄', order: 41 },
  { id: 42, code: '42', name: '長崎県', region: '九州・沖縄', order: 42 },
  { id: 43, code: '43', name: '熊本県', region: '九州・沖縄', order: 43 },
  { id: 44, code: '44', name: '大分県', region: '九州・沖縄', order: 44 },
  { id: 45, code: '45', name: '宮崎県', region: '九州・沖縄', order: 45 },
  { id: 46, code: '46', name: '鹿児島県', region: '九州・沖縄', order: 46 },
  { id: 47, code: '47', name: '沖縄県', region: '九州・沖縄', order: 47 },
];

async function seedPrefectures() {
  console.log('=== 都道府県マスタデータ投入 ===\n');

  for (const pref of prefectures) {
    try {
      await db.execute({
        sql: `
          INSERT INTO m_prefectures (
            prefecture_id, prefecture_code, prefecture_name,
            region_name, display_order, is_active, created_at
          ) VALUES (?, ?, ?, ?, ?, 1, datetime('now', '+9 hours'))
          ON CONFLICT(prefecture_id) DO UPDATE SET
            prefecture_code = excluded.prefecture_code,
            prefecture_name = excluded.prefecture_name,
            region_name = excluded.region_name,
            display_order = excluded.display_order
        `,
        args: [pref.id, pref.code, pref.name, pref.region, pref.order],
      });
      console.log(`✓ ${pref.name} を登録しました`);
    } catch (error) {
      console.error(`✗ ${pref.name} の登録に失敗:`, error);
    }
  }

  console.log(`\n✨ ${prefectures.length}件の都道府県データを登録完了しました`);
}

seedPrefectures().catch(console.error);
