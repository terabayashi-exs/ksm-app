const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return;
  }

  const equalIndex = trimmed.indexOf('=');
  if (equalIndex === -1) {
    return;
  }

  const key = trimmed.substring(0, equalIndex).trim();
  let value = trimmed.substring(equalIndex + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  envVars[key] = value;
});

console.log('DATABASE_URL:', envVars.DATABASE_URL ? '設定済み' : '未設定');
console.log('DATABASE_AUTH_TOKEN:', envVars.DATABASE_AUTH_TOKEN ? '設定済み' : '未設定');

if (!envVars.DATABASE_URL || !envVars.DATABASE_AUTH_TOKEN) {
  console.error('エラー: DATABASE_URLまたはDATABASE_AUTH_TOKENが.env.localに設定されていません');
  process.exit(1);
}

const db = createClient({
  url: envVars.DATABASE_URL,
  authToken: envVars.DATABASE_AUTH_TOKEN
});

async function rollbackRedundantFields() {
  try {
    console.log('=== 冗長な部門関連フィールドのロールバック開始 ===\n');

    // 1. 現在のテーブル構造を確認
    console.log('【ロールバック前のt_tournaments構造確認】');
    const beforeColumns = await db.execute(`PRAGMA table_info(t_tournaments)`);
    console.log(`現在のカラム数: ${beforeColumns.rows.length}`);

    const redundantFields = ['division_name', 'division_code', 'division_order', 'parent_tournament_id', 'is_division'];
    const foundRedundant = redundantFields.filter(field =>
      beforeColumns.rows.some(col => col.name === field)
    );

    if (foundRedundant.length === 0) {
      console.log('冗長なフィールドは既に削除されています。処理をスキップします。');
      return;
    }

    console.log(`削除対象フィールド: ${foundRedundant.join(', ')}\n`);

    // 2. 外部キー制約を一時的に無効化
    console.log('外部キー制約を無効化中...');
    await db.execute('PRAGMA foreign_keys = OFF');
    console.log('✓ 外部キー制約無効化完了\n');

    // 2.5. 既存のt_tournaments_newテーブルがあれば削除（前回の失敗時の残骸）
    try {
      await db.execute('DROP TABLE IF EXISTS t_tournaments_new');
      console.log('✓ 既存の一時テーブル削除完了\n');
    } catch (error) {
      // エラーがあっても続行
    }

    // 3. データ件数を確認
    const countResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments');
    const recordCount = countResult.rows[0].count;
    console.log(`現在のレコード数: ${recordCount}件\n`);

    // 3. 新しいテーブルを作成（冗長フィールドを除外）
    console.log('新しいテーブル構造を作成中...');
    await db.execute(`
      CREATE TABLE t_tournaments_new AS
      SELECT
        tournament_id,
        tournament_name,
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        sport_type_id,
        created_by,
        archive_ui_version,
        is_archived,
        archived_at,
        archived_by,
        created_at,
        updated_at,
        files_count,
        group_order,
        category_name,
        group_id
      FROM t_tournaments
    `);
    console.log('✓ 新しいテーブル作成完了');

    // 4. データ件数を確認
    const newCountResult = await db.execute('SELECT COUNT(*) as count FROM t_tournaments_new');
    const newRecordCount = newCountResult.rows[0].count;

    if (newRecordCount !== recordCount) {
      throw new Error(`データ件数が一致しません（元: ${recordCount}件、新: ${newRecordCount}件）`);
    }
    console.log(`✓ データ移行確認完了: ${newRecordCount}件\n`);

    // 5. 元のテーブルを削除
    console.log('元のテーブルを削除中...');
    await db.execute('DROP TABLE t_tournaments');
    console.log('✓ 元のテーブル削除完了');

    // 6. 新しいテーブルをリネーム
    console.log('新しいテーブルをリネーム中...');
    await db.execute('ALTER TABLE t_tournaments_new RENAME TO t_tournaments');
    console.log('✓ テーブルリネーム完了');

    // 7. インデックスを再作成
    console.log('\nインデックスを再作成中...');
    const indexes = [
      { name: 'idx_tournament_format', column: 'format_id' },
      { name: 'idx_tournament_venue', column: 'venue_id' },
      { name: 'idx_tournament_creator', column: 'created_by' },
      { name: 'idx_tournament_status', column: 'status' },
      { name: 'idx_tournament_group', column: 'group_id' }
    ];

    for (const idx of indexes) {
      await db.execute(`CREATE INDEX IF NOT EXISTS ${idx.name} ON t_tournaments(${idx.column})`);
      console.log(`✓ インデックス作成: ${idx.name}`);
    }

    // 8. 最終確認
    console.log('\n【ロールバック後のt_tournaments構造確認】');
    const afterColumns = await db.execute(`PRAGMA table_info(t_tournaments)`);
    console.log(`最終カラム数: ${afterColumns.rows.length}`);

    const stillExists = redundantFields.filter(field =>
      afterColumns.rows.some(col => col.name === field)
    );

    if (stillExists.length > 0) {
      throw new Error(`以下のフィールドがまだ存在します: ${stillExists.join(', ')}`);
    }

    // 9. 外部キー制約を再度有効化
    console.log('\n外部キー制約を再度有効化中...');
    await db.execute('PRAGMA foreign_keys = ON');
    console.log('✓ 外部キー制約有効化完了');

    console.log('\n=== ロールバック完了 ===');
    console.log(`削除されたフィールド: ${foundRedundant.join(', ')}`);
    console.log(`保持されたレコード数: ${recordCount}件`);

  } catch (error) {
    console.error('ロールバックエラー:', error);
    // エラー時も外部キー制約を再度有効化
    try {
      await db.execute('PRAGMA foreign_keys = ON');
    } catch (fkError) {
      console.error('外部キー制約の再有効化に失敗しました:', fkError);
    }
    process.exit(1);
  }
}

rollbackRedundantFields();
