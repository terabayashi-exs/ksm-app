// t_sponsor_bannersテーブルにbanner_sizeカラムを追加 (staging環境用)
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// staging環境の接続情報（コメントアウトされている行から取得）
const STAGING_DB_URL = 'libsql://ksm-stag-asditd.aws-ap-northeast-1.turso.io';
const STAGING_DB_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjkwNjA0MzAsImlkIjoiYjBlMGQ4MTAtMWIxYy00ZTNiLTg4ZDYtZTQxNzNhZDI1NmVmIiwicmlkIjoiZmFjNzViNjQtNTgxNS00MjFmLTg2MDktNDAxMWNlMDJhMDQ2In0.Sc7OAamA1ZLLW2igqSqvneDKMQTpQkMxdkGtZ-fDvQg-tICwUag9lAGZhtxCCxbClk8pzRCSWtsMP2bpNrosDw';

const client = createClient({
  url: STAGING_DB_URL,
  authToken: STAGING_DB_TOKEN
});

async function addBannerSizeColumn() {
  console.log('🔧 [STAGING] t_sponsor_bannersテーブルにbanner_sizeカラムを追加中...\n');

  try {
    // 1. banner_size カラムを追加（デフォルト: 'large'）
    console.log('1. banner_size カラムを追加...');
    await client.execute(`
      ALTER TABLE t_sponsor_banners
      ADD COLUMN banner_size TEXT DEFAULT 'large'
      CHECK(banner_size IN ('large', 'small'))
    `);
    console.log('✅ banner_size カラムを追加しました');

    // 2. 既存データの banner_size を 'large' に設定（念のため）
    console.log('\n2. 既存データの banner_size を設定...');
    const updateResult = await client.execute(`
      UPDATE t_sponsor_banners SET banner_size = 'large' WHERE banner_size IS NULL
    `);
    console.log(`✅ ${updateResult.rowsAffected || 0}件のデータを更新しました`);

    // 3. テーブル構造を確認
    console.log('\n3. テーブル構造を確認...');
    const infoResult = await client.execute(`PRAGMA table_info(t_sponsor_banners)`);

    console.log('\n📊 t_sponsor_banners テーブル構造:');
    console.log('---');
    for (const col of infoResult.rows) {
      console.log(`  ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    }

    // 4. レコード数を確認
    console.log('\n4. データ確認...');
    const countResult = await client.execute(`SELECT COUNT(*) as count FROM t_sponsor_banners`);
    console.log(`✅ 現在のレコード数: ${countResult.rows[0].count}件`);

    console.log('\n✅ [STAGING] カラム追加が完了しました！');

  } catch (error) {
    // カラムが既に存在する場合のエラーを処理
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('⚠️  banner_size カラムは既に存在しています');

      // 既存の構造を表示
      const infoResult = await client.execute(`PRAGMA table_info(t_sponsor_banners)`);
      console.log('\n📊 現在のテーブル構造:');
      for (const col of infoResult.rows) {
        console.log(`  ${col.name} (${col.type})`);
      }
    } else {
      console.error('❌ エラー:', error);
      throw error;
    }
  } finally {
    client.close();
  }
}

addBannerSizeColumn().catch(error => {
  console.error('Failed to add column:', error);
  process.exit(1);
});
