// lib/blob-config.ts
// Vercel Blob Storage の環境別設定

/**
 * 環境に応じた Blob Storage トークンを取得
 */
export function getBlobToken(): string | undefined {
  // 本番環境
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return process.env.PROD_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  }
  
  // 開発環境・プレビュー環境
  return process.env.DEV_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Blob Storage が利用可能かチェック
 */
export function isBlobStorageAvailable(): boolean {
  const token = getBlobToken();
  return !!token && token !== 'dev_fallback_token';
}

/**
 * 環境情報をログ出力（デバッグ用）
 */
export function logBlobConfig(): void {
  console.log('🔍 Blob Storage 設定:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  VERCEL_ENV: ${process.env.VERCEL_ENV}`);
  console.log(`  使用トークン: ${getBlobToken()?.substring(0, 20)}...`);
  console.log(`  Blob利用可能: ${isBlobStorageAvailable()}`);
}