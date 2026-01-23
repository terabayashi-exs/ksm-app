// t_tournament_filesテーブルに外部URLリンク用のカラムを追加（stag環境用）
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// stag環境の接続情報を直接指定
const client = createClient({
  url: 'libsql://ksm-stag-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjkwNjA0MzAsImlkIjoiYjBlMGQ4MTAtMWIxYy00ZTNiLTg4ZDYtZTQxNzNhZDI1NmVmIiwicmlkIjoiZmFjNzViNjQtNTgxNS00MjFmLTg2MDktNDAxMWNlMDJhMDQ2In0.Sc7OAamA1ZLLW2igqSqvneDKMQTpQkMxdkGtZ-fDvQg-tICwUag9lAGZhtxCCxbClk8pzRCSWtsMP2bpNrosDw'
});

async function addExternalLinkColumns() {
  console.log('🔧 stag環境: t_tournament_filesテーブルにカラムを追加中...\n');

  try {
    // 1. external_url カラムを追加
    console.log('1. external_url カラムを追加...');
    await client.execute(`
      ALTER TABLE t_tournament_files ADD COLUMN external_url TEXT
    `);
    console.log('✅ external_url カラムを追加しました');

    // 2. link_type カラムを追加（デフォルト: 'upload'）
    console.log('\n2. link_type カラムを追加...');
    await client.execute(`
      ALTER TABLE t_tournament_files ADD COLUMN link_type TEXT DEFAULT 'upload'
    `);
    console.log('✅ link_type カラムを追加しました');

    // 3. 既存データの link_type を 'upload' に設定
    console.log('\n3. 既存データの link_type を設定...');
    const updateResult = await client.execute(`
      UPDATE t_tournament_files SET link_type = 'upload' WHERE link_type IS NULL
    `);
    console.log(`✅ ${updateResult.rowsAffected || 0}件のデータを更新しました`);

    // 4. テーブル構造を確認
    console.log('\n4. テーブル構造を確認...');
    const infoResult = await client.execute(`PRAGMA table_info(t_tournament_files)`);

    console.log('\n📊 t_tournament_files テーブル構造:');
    console.log('---');
    for (const col of infoResult.rows) {
      console.log(`  ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    }

    console.log('\n✅ stag環境へのカラム追加が完了しました！');

  } catch (error) {
    // カラムが既に存在する場合のエラーを処理
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('⚠️  カラムは既に存在しています');
    } else {
      console.error('❌ エラー:', error);
      throw error;
    }
  } finally {
    client.close();
  }
}

addExternalLinkColumns().catch(error => {
  console.error('Failed to add columns:', error);
  process.exit(1);
});
