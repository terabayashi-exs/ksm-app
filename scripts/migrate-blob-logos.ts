/**
 * Blob Storage ロゴ整理スクリプト
 *
 * stag/prod の Blob で TOPレベルに配置されているロゴファイルを
 * logos/{loginUserId}/ フォルダ配下に移動する
 *
 * 使い方:
 *   npx tsx scripts/migrate-blob-logos.ts [環境]
 *
 *   環境: dev | stag | main (デフォルト: dev)
 *
 * ドライラン（確認のみ）:
 *   npx tsx scripts/migrate-blob-logos.ts stag --dry-run
 */

import { put, del, list } from '@vercel/blob';

// stag用トークンを直接定義（.env.localでコメントアウトしている場合でも使えるよう）
const STAG_BLOB_TOKEN = 'vercel_blob_rw_7dFc9SEr26ki82tz_ZfDDkc7DIsGGSRgPoJaaZ1XaZ734Up';

// 環境別トークン取得
function getToken(env: string): string {
  switch (env) {
    case 'main':
    case 'prod':
      return process.env.PROD_BLOB_READ_WRITE_TOKEN || '';
    case 'stag':
      return process.env.BLOB_READ_WRITE_TOKEN || STAG_BLOB_TOKEN;
    case 'dev':
    default:
      return process.env.DEV_BLOB_READ_WRITE_TOKEN || '';
  }
}

// DB接続（環境別）
async function getDb(env: string) {
  const { createClient } = await import('@libsql/client');

  let url: string, authToken: string;
  switch (env) {
    case 'main':
    case 'prod':
      url = process.env.DATABASE_URL_MAIN || '';
      authToken = process.env.DATABASE_AUTH_TOKEN_MAIN || '';
      break;
    case 'stag':
      url = process.env.DATABASE_URL_STAG || '';
      authToken = process.env.DATABASE_AUTH_TOKEN_STAG || '';
      break;
    case 'dev':
    default:
      url = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || '';
      authToken = process.env.DATABASE_AUTH_TOKEN_DEV || process.env.DATABASE_AUTH_TOKEN || '';
      break;
  }

  return createClient({ url, authToken });
}

async function main() {
  // .env.local 読み込み
  const { config } = await import('dotenv');
  config({ path: '.env.local' });

  const args = process.argv.slice(2);
  const env = args.find(a => !a.startsWith('--')) || 'dev';
  const dryRun = args.includes('--dry-run');

  console.log(`\n🔍 Blob ロゴ整理スクリプト`);
  console.log(`   環境: ${env}`);
  console.log(`   モード: ${dryRun ? 'ドライラン（確認のみ）' : '実行'}`);
  console.log('');

  const token = getToken(env);
  if (!token) {
    console.error('❌ Blob トークンが見つかりません');
    process.exit(1);
  }

  // 1. Blob 内の全ファイルを取得
  console.log('📋 Blob内のファイル一覧を取得中...');
  const { blobs } = await list({ token });

  console.log(`   全ファイル数: ${blobs.length}`);

  // ロゴファイルかどうか判定（TOPレベルにある画像ファイル）
  const topLevelLogos = blobs.filter(b => {
    const path = b.pathname;
    // logos/ フォルダ配下は既に正しい
    if (path.startsWith('logos/')) return false;
    // tournaments/ など他のフォルダは対象外
    if (path.includes('/')) return false;
    // 画像ファイルのみ
    return /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(path) || path.includes('logo');
  });

  if (topLevelLogos.length === 0) {
    console.log('✅ TOPレベルにロゴファイルはありません。整理不要です。');

    // 参考: 現在のファイル一覧
    console.log('\n📂 全ファイル一覧:');
    for (const b of blobs) {
      console.log(`   ${b.pathname} (${(b.size / 1024).toFixed(1)} KB)`);
    }
    return;
  }

  console.log(`\n🎯 移動対象のTOPレベルロゴファイル: ${topLevelLogos.length} 件`);
  for (const b of topLevelLogos) {
    console.log(`   - ${b.pathname} (${(b.size / 1024).toFixed(1)} KB, ${b.uploadedAt})`);
  }

  // 2. DBからロゴ情報を取得
  console.log('\n📊 DBからロゴ情報を取得中...');
  const db = await getDb(env);

  const result = await db.execute(
    'SELECT login_user_id, logo_blob_url, logo_filename, organization_name FROM m_login_users WHERE logo_blob_url IS NOT NULL'
  );

  console.log(`   ロゴ登録ユーザー数: ${result.rows.length}`);

  // URL → loginUserId のマップ
  const urlToUser: Record<string, { loginUserId: number; filename: string; orgName: string }> = {};
  for (const row of result.rows) {
    const url = row.logo_blob_url as string;
    urlToUser[url] = {
      loginUserId: row.login_user_id as number,
      filename: (row.logo_filename as string) || '',
      orgName: (row.organization_name as string) || '',
    };
  }

  // 3. 各ファイルを移動
  console.log('\n🔄 ファイル移動を開始...');
  let movedCount = 0;
  let skippedCount = 0;

  for (const blob of topLevelLogos) {
    const userInfo = urlToUser[blob.url];

    if (!userInfo) {
      console.log(`   ⚠️ スキップ: ${blob.pathname} (DBに対応するユーザーなし)`);
      skippedCount++;
      continue;
    }

    const extension = blob.pathname.split('.').pop() || 'png';
    const newFilename = userInfo.filename || `logo-${Date.now()}.${extension}`;
    const newPath = `logos/${userInfo.loginUserId}/${newFilename}`;

    console.log(`   📦 ${blob.pathname} → ${newPath} (user: ${userInfo.loginUserId}, org: ${userInfo.orgName})`);

    if (dryRun) {
      movedCount++;
      continue;
    }

    try {
      // ダウンロード
      const response = await fetch(blob.url);
      const fileData = await response.arrayBuffer();

      // 新しいパスでアップロード
      const newBlob = await put(newPath, Buffer.from(fileData), {
        access: 'public',
        contentType: 'image/png',
        token,
        addRandomSuffix: false,
      });

      // DB更新
      await db.execute(
        `UPDATE m_login_users SET logo_blob_url = ?, logo_filename = ?, updated_at = datetime('now', '+9 hours') WHERE login_user_id = ?`,
        [newBlob.url, newFilename, userInfo.loginUserId]
      );

      // 旧ファイル削除
      await del(blob.url, { token });

      console.log(`   ✅ 完了: ${newBlob.url}`);
      movedCount++;
    } catch (error) {
      console.error(`   ❌ エラー: ${blob.pathname}`, error);
    }
  }

  console.log(`\n📊 結果:`);
  console.log(`   移動${dryRun ? '予定' : '完了'}: ${movedCount} 件`);
  console.log(`   スキップ: ${skippedCount} 件`);

  if (dryRun) {
    console.log('\n💡 実行するには --dry-run を外してください');
  }

  db.close();
}

main().catch(console.error);
