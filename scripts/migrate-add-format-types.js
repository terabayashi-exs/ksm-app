// scripts/migrate-add-format-types.js
// m_tournament_formatsに試合形式フィールドを追加し、既存データを自動判定するマイグレーション

const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function detectFormatType(formatId, phase) {
  try {
    // そのフォーズの試合テンプレートを取得
    const templates = await db.execute(`
      SELECT DISTINCT block_name
      FROM m_match_templates
      WHERE format_id = ? AND phase = ?
    `, [formatId, phase]);

    if (templates.rows.length === 0) {
      return null; // そのフェーズが存在しない
    }

    // ブロック数で判定
    const blockCount = templates.rows.length;

    if (blockCount === 1) {
      // 単一ブロック = トーナメント戦
      return 'tournament';
    } else {
      // 複数ブロック = リーグ戦
      return 'league';
    }
  } catch (error) {
    console.error(`Format ${formatId}, Phase ${phase} の判定エラー:`, error);
    return null;
  }
}

(async () => {
  try {
    console.log('🔧 m_tournament_formatsテーブルにフィールドを追加します...\n');

    // 1. フィールド追加（既に存在する場合はエラーが出るが無視）
    try {
      await db.execute(`
        ALTER TABLE m_tournament_formats
        ADD COLUMN preliminary_format_type TEXT
      `);
      console.log('✅ preliminary_format_type フィールドを追加しました');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️  preliminary_format_type フィールドは既に存在します');
      } else {
        throw error;
      }
    }

    try {
      await db.execute(`
        ALTER TABLE m_tournament_formats
        ADD COLUMN final_format_type TEXT
      `);
      console.log('✅ final_format_type フィールドを追加しました');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️  final_format_type フィールドは既に存在します');
      } else {
        throw error;
      }
    }

    console.log('\n📊 既存フォーマットの試合形式を自動判定します...\n');

    // 2. 既存フォーマットを取得
    const formats = await db.execute('SELECT format_id, format_name FROM m_tournament_formats');

    console.log(`全${formats.rows.length}件のフォーマットを処理します\n`);

    let updatedCount = 0;

    for (const format of formats.rows) {
      const formatId = format.format_id;
      const formatName = format.format_name;

      // 予選の形式を判定
      const preliminaryType = await detectFormatType(formatId, 'preliminary');

      // 決勝の形式を判定
      const finalType = await detectFormatType(formatId, 'final');

      console.log(`Format ID ${formatId}: ${formatName}`);
      console.log(`  予選: ${preliminaryType === null ? '(なし)' : preliminaryType === 'league' ? 'リーグ戦' : 'トーナメント戦'}`);
      console.log(`  決勝: ${finalType === null ? '(なし)' : finalType === 'league' ? 'リーグ戦' : 'トーナメント戦'}`);

      // データベース更新
      await db.execute(`
        UPDATE m_tournament_formats
        SET preliminary_format_type = ?,
            final_format_type = ?
        WHERE format_id = ?
      `, [preliminaryType, finalType, formatId]);

      updatedCount++;
    }

    console.log(`\n✅ ${updatedCount}件のフォーマットを更新しました`);

    // 3. 結果確認
    console.log('\n📋 更新後のデータ確認:\n');
    const result = await db.execute(`
      SELECT
        format_id,
        format_name,
        preliminary_format_type,
        final_format_type
      FROM m_tournament_formats
      ORDER BY format_id
    `);

    console.log('ID | フォーマット名 | 予選 | 決勝');
    console.log('---|-------------|------|------');
    result.rows.forEach(row => {
      const prelim = row.preliminary_format_type || '(なし)';
      const final = row.final_format_type || '(なし)';
      console.log(`${row.format_id} | ${row.format_name} | ${prelim} | ${final}`);
    });

    console.log('\n✅ マイグレーション完了');

  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
})();
