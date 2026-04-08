// app/api/admin/sponsor-banners/[id]/route.ts
// スポンサーバナー個別操作API（更新・削除）

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteBlobByUrl } from "@/lib/blob-helpers";
import { db } from "@/lib/db";
import { UpdateSponsorBannerInput } from "@/lib/sponsor-banner-specs";

// バナー更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const { id } = await params;
    const bannerId = id;
    const body: UpdateSponsorBannerInput = await request.json();

    // バナーの存在確認（古い画像URLも取得）
    const existingBanner = await db.execute({
      sql: "SELECT banner_id, image_blob_url FROM t_sponsor_banners WHERE banner_id = ?",
      args: [bannerId],
    });

    if (existingBanner.rows.length === 0) {
      return NextResponse.json({ error: "バナーが見つかりません" }, { status: 404 });
    }

    const oldImageBlobUrl = existingBanner.rows[0].image_blob_url as string;

    // 更新可能なフィールド
    const updateFields: string[] = [];
    const updateValues: (string | number | null)[] = [];

    if (body.banner_name !== undefined) {
      updateFields.push("banner_name = ?");
      updateValues.push(body.banner_name);
    }
    if (body.banner_url !== undefined) {
      updateFields.push("banner_url = ?");
      updateValues.push(body.banner_url || null);
    }
    if (body.image_blob_url !== undefined) {
      updateFields.push("image_blob_url = ?");
      updateValues.push(body.image_blob_url);
    }
    if (body.image_filename !== undefined) {
      updateFields.push("image_filename = ?");
      updateValues.push(body.image_filename || null);
    }
    if (body.file_size !== undefined) {
      updateFields.push("file_size = ?");
      updateValues.push(body.file_size || null);
    }
    if (body.display_position !== undefined) {
      if (!["top", "bottom", "sidebar"].includes(body.display_position)) {
        return NextResponse.json({ error: "無効なdisplay_positionです" }, { status: 400 });
      }
      updateFields.push("display_position = ?");
      updateValues.push(body.display_position);
    }
    if (body.target_tab !== undefined) {
      const validTabs = [
        "all",
        "overview",
        "schedule",
        "preliminary",
        "final",
        "standings",
        "teams",
      ];
      if (!validTabs.includes(body.target_tab)) {
        return NextResponse.json({ error: "無効なtarget_tabです" }, { status: 400 });
      }
      updateFields.push("target_tab = ?");
      updateValues.push(body.target_tab);
    }
    if (body.banner_size !== undefined) {
      if (!["large", "small"].includes(body.banner_size)) {
        return NextResponse.json({ error: "無効なbanner_sizeです" }, { status: 400 });
      }
      // 小バナーがサイドバーに配置されていないかチェック
      const existingBannerData = existingBanner.rows[0] as unknown as { display_position: string };
      const currentPosition = body.display_position || existingBannerData.display_position;
      if (body.banner_size === "small" && currentPosition === "sidebar") {
        return NextResponse.json(
          { error: "小バナーはサイドバーに配置できません" },
          { status: 400 },
        );
      }
      updateFields.push("banner_size = ?");
      updateValues.push(body.banner_size);
    }
    if (body.display_order !== undefined) {
      updateFields.push("display_order = ?");
      updateValues.push(body.display_order);
    }
    if (body.is_active !== undefined) {
      updateFields.push("is_active = ?");
      updateValues.push(body.is_active);
    }
    if (body.start_date !== undefined) {
      updateFields.push("start_date = ?");
      updateValues.push(body.start_date || null);
    }
    if (body.end_date !== undefined) {
      updateFields.push("end_date = ?");
      updateValues.push(body.end_date || null);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
    }

    // updated_atを自動更新
    updateFields.push("updated_at = datetime('now', '+9 hours')");

    // 更新実行
    updateValues.push(bannerId);
    await db.execute({
      sql: `
        UPDATE t_sponsor_banners
        SET ${updateFields.join(", ")}
        WHERE banner_id = ?
      `,
      args: updateValues,
    });

    // 画像が更新された場合、古い画像をBlobから削除
    if (body.image_blob_url !== undefined && body.image_blob_url !== oldImageBlobUrl) {
      console.log("🗑️ 古い画像を削除:", oldImageBlobUrl);
      await deleteBlobByUrl(oldImageBlobUrl);
    }

    // 更新後のバナーを取得
    const updatedBanner = await db.execute({
      sql: "SELECT * FROM t_sponsor_banners WHERE banner_id = ?",
      args: [bannerId],
    });

    return NextResponse.json({
      message: "バナーを更新しました",
      banner: updatedBanner.rows[0],
    });
  } catch (error) {
    console.error("バナー更新エラー:", error);
    return NextResponse.json({ error: "バナーの更新に失敗しました" }, { status: 500 });
  }
}

// バナー削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const { id } = await params;
    const bannerId = id;

    // バナーの存在確認
    const existingBanner = await db.execute({
      sql: "SELECT banner_id, image_blob_url FROM t_sponsor_banners WHERE banner_id = ?",
      args: [bannerId],
    });

    if (existingBanner.rows.length === 0) {
      return NextResponse.json({ error: "バナーが見つかりません" }, { status: 404 });
    }

    const imageBlobUrl = existingBanner.rows[0].image_blob_url as string;

    // バナー削除
    await db.execute({
      sql: "DELETE FROM t_sponsor_banners WHERE banner_id = ?",
      args: [bannerId],
    });

    // Vercel Blobから画像を削除
    console.log("🗑️ バナー削除に伴い画像も削除:", imageBlobUrl);
    await deleteBlobByUrl(imageBlobUrl);

    return NextResponse.json({
      message: "バナーを削除しました",
    });
  } catch (error) {
    console.error("バナー削除エラー:", error);
    return NextResponse.json({ error: "バナーの削除に失敗しました" }, { status: 500 });
  }
}
