// lib/blob-helpers.ts
// Vercel Blob Storage ヘルパー関数

import { del } from "@vercel/blob";
import { getBlobToken, isBlobStorageAvailable } from "@/lib/blob-config";

/**
 * Vercel BlobからファイルをURLで削除
 * @param blobUrl 削除対象のBlobURL
 * @returns 削除成功: true, 失敗: false
 */
export async function deleteBlobByUrl(blobUrl: string): Promise<boolean> {
  // Data URLの場合は削除不要（開発環境用フォールバック）
  if (blobUrl.startsWith("data:")) {
    console.log("📝 Data URLのため削除をスキップ:", blobUrl.substring(0, 50) + "...");
    return true;
  }

  try {
    const blobToken = getBlobToken();

    if (!blobToken || !isBlobStorageAvailable()) {
      console.warn("⚠️ Blob Storage トークンが設定されていません。削除をスキップします。");
      return false;
    }

    console.log("🗑️ Blob削除開始:", blobUrl);
    await del(blobUrl, { token: blobToken });
    console.log("✅ Blob削除完了:", blobUrl);
    return true;
  } catch (error) {
    console.error("❌ Blob削除エラー:", error);
    console.error("削除対象URL:", blobUrl);
    // 削除失敗してもエラーにはしない（すでに削除済みの可能性もある）
    return false;
  }
}

/**
 * 複数のBlobファイルを一括削除
 * @param blobUrls 削除対象のBlobURLの配列
 * @returns 削除成功数
 */
export async function deleteBlobsByUrls(blobUrls: string[]): Promise<number> {
  let successCount = 0;

  for (const url of blobUrls) {
    const success = await deleteBlobByUrl(url);
    if (success) {
      successCount++;
    }
  }

  console.log(`📊 Blob一括削除完了: ${successCount}/${blobUrls.length}件`);
  return successCount;
}
