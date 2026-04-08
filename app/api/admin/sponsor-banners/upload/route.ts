// app/api/admin/sponsor-banners/upload/route.ts
// スポンサーバナー画像アップロードAPI

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBlobToken, isBlobStorageAvailable, logBlobConfig } from "@/lib/blob-config";
import { MAX_FILE_SIZE, SUPPORTED_IMAGE_TYPES } from "@/lib/sponsor-banner-specs";

// ファイル名をサニタイズする関数
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 100);
}

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 画像サイズ（ピクセル）を取得
async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 簡易的な画像サイズ取得（PNGとJPEGのみ対応）
    if (file.type === "image/png") {
      // PNG: 16-19バイト目にwidth、20-23バイト目にheight
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
      // JPEGの場合は簡易チェックのみ（完全な実装は複雑）
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

interface UploadResponse {
  success: boolean;
  data?: {
    blob_url: string;
    filename: string;
    file_size: number;
    dimensions?: {
      width: number;
      height: number;
    };
  };
  error?: string;
  details?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  console.log("🚀 バナー画像アップロードAPI開始");

  try {
    // 認証チェック
    console.log("🔐 認証チェック開始");
    const session = await auth();
    console.log("👤 セッション情報:", session?.user?.id, session?.user?.role);

    if (!session || session.user.role !== "admin") {
      console.log("❌ 認証失敗: 管理者権限なし");
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    console.log("✅ 認証成功");

    // FormDataから情報を取得
    console.log("📋 FormData解析開始");
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const tournament_id = formData.get("tournament_id") as string;

    console.log("📂 ファイル情報:", {
      filename: file?.name,
      size: file?.size,
      type: file?.type,
      tournament_id,
    });

    // バリデーション
    if (!file) {
      return NextResponse.json(
        { success: false, error: "ファイルが選択されていません" },
        { status: 400 },
      );
    }

    if (!tournament_id) {
      return NextResponse.json({ success: false, error: "大会IDが必要です" }, { status: 400 });
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `ファイルサイズが大きすぎます。最大${formatFileSize(MAX_FILE_SIZE)}まで`,
        },
        { status: 400 },
      );
    }

    // ファイル形式チェック
    const fileType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    if (!SUPPORTED_IMAGE_TYPES.includes(fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: `対応していない画像形式です。対応形式: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // 画像サイズ（ピクセル）を取得
    const dimensions = await getImageDimensions(file);
    if (dimensions) {
      console.log("📐 画像サイズ:", dimensions);
    }

    // ファイル名をサニタイズ
    const sanitizedFilename = sanitizeFilename(file.name);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blobFilename = `sponsor-banners/${tournament_id}/${timestamp}_${sanitizedFilename}`;

    // Vercel Blob Storageにアップロード
    console.log("🔄 Vercel Blob Storageにアップロード中...");
    logBlobConfig();

    const blobToken = getBlobToken();
    let blob;

    try {
      if (!blobToken || !isBlobStorageAvailable()) {
        throw new Error("Blob Storage トークンが設定されていません");
      }

      blob = await put(blobFilename, file, {
        access: "public",
        token: blobToken,
      });
      console.log("✅ Blob Storage アップロード完了:", blob.url);
    } catch (blobError) {
      console.warn("⚠️ Vercel Blob Storage エラー:", blobError);

      // 開発環境用フォールバック: データURLとして保存
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 開発環境用フォールバック処理を実行中...");

        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUrl = `data:${file.type};base64,${base64}`;

        blob = {
          url: dataUrl,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        };

        console.log("✅ 開発環境用ファイル保存完了（Base64形式）");
      } else {
        throw new Error(
          `Blob Storage エラー: ${blobError instanceof Error ? blobError.message : String(blobError)}`,
        );
      }
    }

    console.log("✅ アップロード完了");

    return NextResponse.json({
      success: true,
      data: {
        blob_url: blob.url,
        filename: file.name,
        file_size: file.size,
        dimensions: dimensions || undefined,
      },
    });
  } catch (error) {
    console.error("❌ バナー画像アップロードエラー:", error);
    console.error("❌ エラースタック:", error instanceof Error ? error.stack : "スタックなし");
    console.error("❌ エラー詳細:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error.cause : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: "画像アップロードに失敗しました",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
