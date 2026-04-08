// lib/blob-config.ts
// Vercel Blob Storage の環境別設定

/**
 * 環境に応じた Blob Storage トークンを取得
 *
 * 環境変数構成：
 * - Production (main): PROD_BLOB_READ_WRITE_TOKEN
 * - Preview (dev): DEV_BLOB_READ_WRITE_TOKEN
 * - Preview (staging): BLOB_READ_WRITE_TOKEN（Vercel自動生成）
 */
export function getBlobToken(): string | undefined {
  const nodeEnv = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;

  console.log("🌍 環境情報:", { nodeEnv, vercelEnv, gitBranch });
  console.log("🔑 利用可能なトークン:", {
    BLOB: !!process.env.BLOB_READ_WRITE_TOKEN,
    DEV_BLOB: !!process.env.DEV_BLOB_READ_WRITE_TOKEN,
    PROD_BLOB: !!process.env.PROD_BLOB_READ_WRITE_TOKEN,
  });

  // 本番環境: PROD_BLOB_READ_WRITE_TOKEN
  if (vercelEnv === "production") {
    const token = process.env.PROD_BLOB_READ_WRITE_TOKEN;
    console.log("🏭 本番環境トークン選択:", token ? "設定済み" : "未設定");
    return token;
  }

  // staging環境: BLOB_READ_WRITE_TOKEN（Preview, Branch: staging）
  // BLOB_READ_WRITE_TOKENが設定されている = staging環境
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    console.log(`✅ staging環境トークン選択: プレビュー(${gitBranch})`);
    return process.env.BLOB_READ_WRITE_TOKEN;
  }

  // dev環境: DEV_BLOB_READ_WRITE_TOKEN（Preview, Branch: dev）
  const token = process.env.DEV_BLOB_READ_WRITE_TOKEN;
  console.log("🧪 dev環境トークン選択:", token ? "設定済み" : "未設定");
  return token;
}

/**
 * Blob Storage が利用可能かチェック
 */
export function isBlobStorageAvailable(): boolean {
  const token = getBlobToken();
  return !!token && token !== "dev_fallback_token";
}

/**
 * 環境情報をログ出力（デバッグ用）
 */
export function logBlobConfig(): void {
  console.log("🔍 Blob Storage 設定:");
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  VERCEL_ENV: ${process.env.VERCEL_ENV}`);
  console.log(`  使用トークン: ${getBlobToken()?.substring(0, 20)}...`);
  console.log(`  Blob利用可能: ${isBlobStorageAvailable()}`);
}
