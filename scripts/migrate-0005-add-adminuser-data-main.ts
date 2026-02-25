/**
 * マイグレーション 0005: 管理者ユーザーデータ移行スクリプト（main環境用）
 *
 * dev環境のlogin_user_id:1のデータをmain環境に複製します
 * - m_login_users
 * - m_login_user_roles
 * - m_login_user_authority
 * - Blobに登録されているロゴも複製（PROD_BLOB_READ_WRITE_TOKEN使用）
 *
 * 使用方法:
 *   npx tsx scripts/migrate-0005-add-adminuser-data-main.ts
 *
 * 注意:
 *   - dev環境からmain環境へのコピーのみ対応
 *   - login_user_id:1のデータのみ対象
 *   - 本番環境への適用のため、慎重に実行してください
 */

import { createClient } from '@libsql/client';
import { put } from '@vercel/blob';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// dev環境の接続情報
const devDb = createClient({
  url: process.env.DATABASE_URL_DEV || process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN_DEV || process.env.DATABASE_AUTH_TOKEN,
});

// main環境の接続情報
const mainDb = createClient({
  url: process.env.DATABASE_URL_MAIN!,
  authToken: process.env.DATABASE_AUTH_TOKEN_MAIN,
});

interface LoginUser {
  login_user_id: number;
  email: string;
  password_hash: string;
  display_name: string;
  logo_url?: string | null;
  logo_blob_url?: string | null;
  logo_filename?: string | null;
  organization_name?: string | null;
  current_plan_id?: number | null;
  is_superadmin: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface LoginUserRole {
  id: number;
  login_user_id: number;
  role: string;
  created_at: string;
}

interface LoginUserAuthority {
  id: number;
  login_user_id: number;
  tournament_id: number;
  permissions: string;
  created_at: string;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  マイグレーション 0005: 管理者ユーザーデータ移行');
  console.log('  dev環境 → main環境（本番）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('⚠️  注意: 本番環境への適用です。慎重に実行してください。\n');

  try {
    // ステップ1: dev環境からlogin_user_id:1のデータを取得
    console.log('📖 [STEP 1] dev環境からデータを取得中...\n');

    const userResult = await devDb.execute({
      sql: `SELECT * FROM m_login_users WHERE login_user_id = ?`,
      args: [1]
    });

    if (userResult.rows.length === 0) {
      console.error('❌ エラー: dev環境にlogin_user_id:1のユーザーが見つかりません');
      process.exit(1);
    }

    const user = userResult.rows[0] as unknown as LoginUser;
    console.log(`✓ ユーザー情報を取得: ${user.display_name} (${user.email})`);
    console.log(`  - is_superadmin: ${user.is_superadmin === 1 ? 'はい' : 'いいえ'}`);
    console.log(`  - logo_url: ${user.logo_url || user.logo_blob_url || '(なし)'}`);
    console.log(`  - organization_name: ${user.organization_name || '(なし)'}\n`);

    // ロールを取得
    const rolesResult = await devDb.execute({
      sql: `SELECT * FROM m_login_user_roles WHERE login_user_id = ?`,
      args: [1]
    });
    const roles = rolesResult.rows as unknown as LoginUserRole[];
    console.log(`✓ ロールを取得: ${roles.length}件`);
    roles.forEach(role => console.log(`  - ${role.role}`));
    console.log('');

    // 権限を取得
    const authResult = await devDb.execute({
      sql: `SELECT * FROM m_login_user_authority WHERE login_user_id = ?`,
      args: [1]
    });
    const authorities = authResult.rows as unknown as LoginUserAuthority[];
    console.log(`✓ 権限を取得: ${authorities.length}件\n`);

    // ステップ2: main環境に既存データがあるかチェック
    console.log('📋 [STEP 2] main環境の既存データをチェック中...\n');

    const existingUserResult = await mainDb.execute({
      sql: `SELECT * FROM m_login_users WHERE login_user_id = ? OR email = ?`,
      args: [1, user.email]
    });

    if (existingUserResult.rows.length > 0) {
      const existingUser = existingUserResult.rows[0] as unknown as LoginUser;
      console.log(`⚠️  警告: main環境に既にデータが存在します`);
      console.log(`  - login_user_id: ${existingUser.login_user_id}`);
      console.log(`  - email: ${existingUser.email}`);
      console.log(`  - display_name: ${existingUser.display_name}\n`);

      console.log('既存データを上書きしますか？');
      console.log('このスクリプトは既存データがある場合は処理を中断します。');
      console.log('手動で削除してから再実行してください。\n');
      process.exit(0);
    }

    console.log('✓ main環境に既存データはありません\n');

    // ステップ3: Blobのロゴを複製（存在する場合）
    let newLogoBlobUrl: string | null = null;
    let newLogoFilename: string | null = null;

    const sourceLogoUrl = user.logo_url || user.logo_blob_url;

    if (sourceLogoUrl) {
      console.log('📤 [STEP 3] Blobのロゴを複製中（PROD_BLOB_READ_WRITE_TOKEN使用）...\n');
      console.log(`元のロゴURL: ${sourceLogoUrl}`);

      try {
        // dev環境のBlobからロゴをダウンロード
        console.log('ロゴをダウンロード中...');
        const response = await fetch(sourceLogoUrl);
        if (!response.ok) {
          throw new Error(`ロゴのダウンロードに失敗: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());
        console.log(`✓ ロゴをダウンロード完了 (${(buffer.length / 1024).toFixed(2)} KB)`);

        // main環境のBlobにアップロード（PROD_BLOB_READ_WRITE_TOKEN使用）
        console.log('main環境のBlobにアップロード中...');
        const filename = user.logo_filename || sourceLogoUrl.split('/').pop() || `admin-logo-${Date.now()}.png`;

        if (!process.env.PROD_BLOB_READ_WRITE_TOKEN) {
          throw new Error('PROD_BLOB_READ_WRITE_TOKEN が設定されていません');
        }

        const uploadResult = await put(filename, buffer, {
          access: 'public',
          token: process.env.PROD_BLOB_READ_WRITE_TOKEN, // main環境用のトークン
        });

        newLogoBlobUrl = uploadResult.url;
        newLogoFilename = filename;
        console.log(`✓ アップロード完了: ${newLogoBlobUrl}\n`);
      } catch (error) {
        console.error('⚠️  ロゴの複製に失敗しました:', error);
        console.log('ロゴなしで続行します...\n');
        newLogoBlobUrl = null;
        newLogoFilename = null;
      }
    } else {
      console.log('📋 [STEP 3] ロゴの複製をスキップ（ロゴが設定されていません）\n');
    }

    // ステップ4: main環境にユーザーデータを登録
    console.log('💾 [STEP 4] main環境にデータを登録中...\n');

    // m_login_users
    console.log('m_login_users に登録中...');
    await mainDb.execute({
      sql: `
        INSERT INTO m_login_users (
          login_user_id, email, password_hash, display_name,
          logo_blob_url, logo_filename, organization_name,
          is_superadmin, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        user.login_user_id,
        user.email,
        user.password_hash,
        user.display_name,
        newLogoBlobUrl,
        newLogoFilename,
        user.organization_name || null,
        user.is_superadmin,
        user.is_active,
        user.created_at,
        user.updated_at
      ]
    });
    console.log('✓ m_login_users に登録完了\n');

    // m_login_user_roles
    if (roles.length > 0) {
      console.log(`m_login_user_roles に登録中 (${roles.length}件)...`);
      for (const role of roles) {
        await mainDb.execute({
          sql: `
            INSERT INTO m_login_user_roles (
              login_user_id, role, created_at
            ) VALUES (?, ?, ?)
          `,
          args: [
            role.login_user_id,
            role.role,
            role.created_at
          ]
        });
        console.log(`  ✓ ロール登録: ${role.role}`);
      }
      console.log('✓ m_login_user_roles に登録完了\n');
    }

    // m_login_user_authority
    if (authorities.length > 0) {
      console.log(`m_login_user_authority に登録中 (${authorities.length}件)...`);
      for (const auth of authorities) {
        await mainDb.execute({
          sql: `
            INSERT INTO m_login_user_authority (
              login_user_id, tournament_id, permissions, created_at
            ) VALUES (?, ?, ?, ?)
          `,
          args: [
            auth.login_user_id,
            auth.tournament_id,
            auth.permissions,
            auth.created_at
          ]
        });
        console.log(`  ✓ 権限登録: tournament_id=${auth.tournament_id}, permissions=${auth.permissions}`);
      }
      console.log('✓ m_login_user_authority に登録完了\n');
    }

    // ステップ5: 登録結果を確認
    console.log('📊 [STEP 5] 登録結果を確認中...\n');

    const verifyResult = await mainDb.execute({
      sql: `SELECT * FROM m_login_users WHERE login_user_id = ?`,
      args: [1]
    });

    if (verifyResult.rows.length === 0) {
      console.error('❌ エラー: main環境にデータが登録されませんでした');
      process.exit(1);
    }

    const verifiedUser = verifyResult.rows[0] as unknown as LoginUser;
    console.log('✓ main環境に正常に登録されました:');
    console.log(`  - login_user_id: ${verifiedUser.login_user_id}`);
    console.log(`  - email: ${verifiedUser.email}`);
    console.log(`  - display_name: ${verifiedUser.display_name}`);
    console.log(`  - logo_blob_url: ${verifiedUser.logo_blob_url || '(なし)'}`);
    console.log(`  - organization_name: ${verifiedUser.organization_name || '(なし)'}`);
    console.log(`  - is_superadmin: ${verifiedUser.is_superadmin === 1 ? 'はい' : 'いいえ'}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ 移行完了（本番環境）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ユーザー: 1件`);
    console.log(`ロール: ${roles.length}件`);
    console.log(`権限: ${authorities.length}件`);
    console.log(`Blobロゴ: ${newLogoBlobUrl ? '複製済み（本番Blob）' : 'なし'}\n`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    devDb.close();
    mainDb.close();
  }
}

main();
