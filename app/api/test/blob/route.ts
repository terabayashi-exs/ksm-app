// app/api/test/blob/route.ts
import { NextRequest, NextResponse } from "next/server";
import { BlobStorage } from "@/lib/blob-storage";

/**
 * Blob Storage のテスト用エンドポイント
 *
 * テスト方法:
 * 1. 書き込みテスト: POST /api/test/blob
 * 2. 読み取りテスト: GET /api/test/blob
 * 3. 削除テスト: DELETE /api/test/blob
 */

// テスト用のファイルパス
const TEST_FILE_PATH = "test/hello-blob.json";

/**
 * Blobからデータを読み取るテスト
 */
export async function GET(_request: NextRequest) {
  try {
    console.log("🔍 Blob読み取りテスト開始...");

    // ファイルの存在確認
    const exists = await BlobStorage.exists(TEST_FILE_PATH);
    if (!exists) {
      return NextResponse.json({
        success: false,
        message: "テストファイルが存在しません。先にPOSTでファイルを作成してください。",
        path: TEST_FILE_PATH,
      });
    }

    // JSONデータを取得
    const data = await BlobStorage.getJson(TEST_FILE_PATH);

    return NextResponse.json({
      success: true,
      message: "Blobからのデータ読み取りに成功しました",
      path: TEST_FILE_PATH,
      data,
    });
  } catch (error) {
    console.error("❌ Blob読み取りエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Blob読み取りエラー",
      },
      { status: 500 },
    );
  }
}

/**
 * Blobにデータを書き込むテスト
 */
export async function POST(_request: NextRequest) {
  try {
    console.log("📝 Blob書き込みテスト開始...");

    // テストデータ
    const testData = {
      message: "Hello from Vercel Blob!",
      timestamp: new Date().toISOString(),
      testInfo: {
        environment: process.env.NODE_ENV,
        hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        random: Math.random(),
      },
    };

    // Blobに保存
    const result = await BlobStorage.putJson(TEST_FILE_PATH, testData);

    return NextResponse.json({
      success: true,
      message: "Blobへのデータ書き込みに成功しました",
      result: {
        pathname: result.pathname,
        contentType: result.contentType,
        url: result.url,
      },
      data: testData,
    });
  } catch (error) {
    console.error("❌ Blob書き込みエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Blob書き込みエラー",
        hint: "BLOB_READ_WRITE_TOKEN環境変数が設定されているか確認してください",
      },
      { status: 500 },
    );
  }
}

/**
 * Blobからデータを削除するテスト
 */
export async function DELETE(_request: NextRequest) {
  try {
    console.log("🗑️ Blob削除テスト開始...");

    // ファイルの存在確認
    const exists = await BlobStorage.exists(TEST_FILE_PATH);
    if (!exists) {
      return NextResponse.json({
        success: false,
        message: "テストファイルが既に存在しません",
        path: TEST_FILE_PATH,
      });
    }

    // ファイルを削除
    await BlobStorage.delete(TEST_FILE_PATH);

    return NextResponse.json({
      success: true,
      message: "Blobからのデータ削除に成功しました",
      path: TEST_FILE_PATH,
    });
  } catch (error) {
    console.error("❌ Blob削除エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Blob削除エラー",
      },
      { status: 500 },
    );
  }
}

/**
 * Blob Storage の詳細テスト
 */
export async function PUT(_request: NextRequest) {
  try {
    console.log("🧪 Blob詳細テスト開始...");

    const results = {
      write: { success: false, message: "" },
      read: { success: false, message: "" },
      list: { success: false, message: "" },
      update: { success: false, message: "" },
      delete: { success: false, message: "" },
    };

    // 1. 書き込みテスト
    try {
      const testData = { test: "data", timestamp: Date.now() };
      await BlobStorage.putJson("test/detail-test.json", testData);
      results.write = { success: true, message: "OK" };
    } catch (error) {
      results.write.message = error instanceof Error ? error.message : "書き込みエラー";
    }

    // 2. 読み取りテスト
    try {
      await BlobStorage.getJson("test/detail-test.json");
      results.read = { success: true, message: "OK" };
    } catch (error) {
      results.read.message = error instanceof Error ? error.message : "読み取りエラー";
    }

    // 3. 一覧取得テスト
    try {
      const files = await BlobStorage.list({ prefix: "test/" });
      results.list = { success: true, message: `${files.length}個のファイル` };
    } catch (error) {
      results.list.message = error instanceof Error ? error.message : "一覧取得エラー";
    }

    // 4. 更新テスト（楽観的ロック）
    try {
      await BlobStorage.updateJsonWithLock(
        "test/detail-test.json",
        (data: Record<string, unknown>) => ({ ...data, updated: true }),
      );
      results.update = { success: true, message: "OK" };
    } catch (error) {
      results.update.message = error instanceof Error ? error.message : "更新エラー";
    }

    // 5. 削除テスト
    try {
      await BlobStorage.delete("test/detail-test.json");
      results.delete = { success: true, message: "OK" };
    } catch (error) {
      results.delete.message = error instanceof Error ? error.message : "削除エラー";
    }

    const allSuccess = Object.values(results).every((r) => r.success);

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess ? "全てのテストが成功しました" : "一部のテストが失敗しました",
      results,
      environment: {
        hasToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        tokenPreview: process.env.BLOB_READ_WRITE_TOKEN
          ? process.env.BLOB_READ_WRITE_TOKEN.substring(0, 20) + "..."
          : "not set",
      },
    });
  } catch (error) {
    console.error("❌ 詳細テストエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "詳細テストエラー",
      },
      { status: 500 },
    );
  }
}
