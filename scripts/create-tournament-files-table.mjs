#!/usr/bin/env node

// 大会ファイル管理テーブル作成スクリプト
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数読み込み
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});

async function createTournamentFilesTable() {
  try {
    console.log('🚀 大会ファイル管理テーブル作成を開始...');

    // SQLファイル読み込み
    const sqlPath = path.join(__dirname, 'create-tournament-files-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // SQL文を実行（セミコロンで分割して個別実行）
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.execute(statement.trim());
          console.log('✅ SQL実行成功:', statement.trim().split('\n')[0] + '...');
        } catch (error) {
          // ALTER TABLE で既に列が存在する場合のエラーは無視
          if (error.message.includes('duplicate column name') || 
              error.message.includes('already exists')) {
            console.log('⚠️  既に存在（スキップ）:', statement.trim().split('\n')[0] + '...');
          } else {
            throw error;
          }
        }
      }
    }

    // テーブル作成確認
    const result = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='t_tournament_files'
    `);

    if (result.rows.length > 0) {
      console.log('✅ t_tournament_files テーブル作成完了');
      
      // テーブル構造確認
      const schema = await db.execute(`PRAGMA table_info(t_tournament_files)`);
      console.log('📋 テーブル構造:');
      schema.rows.forEach(row => {
        console.log(`   ${row.name}: ${row.type} ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
      });

      // インデックス確認
      const indexes = await db.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='t_tournament_files'
      `);
      console.log('🔍 作成されたインデックス:');
      indexes.rows.forEach(row => {
        console.log(`   ${row.name}`);
      });

    } else {
      throw new Error('テーブル作成に失敗しました');
    }

    console.log('🎉 大会ファイル管理テーブル作成処理完了！');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン実行
createTournamentFilesTable();