// app/api/venues/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get("scope");

    if (scope === "available" || scope === "managed") {
      // 認証が必要なスコープ
      const session = await auth();
      if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
        return NextResponse.json(
          { success: false, error: "管理者権限が必要です" },
          { status: 401 },
        );
      }

      const loginUserId = session.user.loginUserId;
      const isSuperadmin = session.user.isSuperadmin;

      if (scope === "available") {
        // 共有会場 + 自分が作成した会場
        const result = await db.execute(
          `
          SELECT
            v.venue_id,
            v.venue_name,
            v.address,
            v.prefecture_id,
            p.prefecture_name,
            v.available_courts,
            v.google_maps_url,
            v.latitude,
            v.longitude,
            v.is_active,
            v.is_shared,
            v.created_by_login_user_id,
            v.created_at,
            v.updated_at
          FROM m_venues v
          LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
          WHERE v.is_shared = 1 OR v.created_by_login_user_id = ?
          ORDER BY v.created_at DESC
        `,
          [loginUserId],
        );

        return NextResponse.json({
          success: true,
          data: mapVenueRows(result.rows),
        });
      }

      if (scope === "managed") {
        // superadmin: 全会場 / 他: 自分が作成した会場のみ
        let result;
        if (isSuperadmin) {
          result = await db.execute(`
            SELECT
              v.venue_id,
              v.venue_name,
              v.address,
              v.prefecture_id,
              p.prefecture_name,
              v.available_courts,
              v.google_maps_url,
              v.latitude,
              v.longitude,
              v.is_active,
              v.is_shared,
              v.created_by_login_user_id,
              v.created_at,
              v.updated_at,
              lu.display_name as created_by_name
            FROM m_venues v
            LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
            LEFT JOIN m_login_users lu ON v.created_by_login_user_id = lu.login_user_id
            ORDER BY v.created_at DESC
          `);
        } else {
          result = await db.execute(
            `
            SELECT
              v.venue_id,
              v.venue_name,
              v.address,
              v.prefecture_id,
              p.prefecture_name,
              v.available_courts,
              v.google_maps_url,
              v.latitude,
              v.longitude,
              v.is_active,
              v.is_shared,
              v.created_by_login_user_id,
              v.created_at,
              v.updated_at
            FROM m_venues v
            LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
            WHERE v.created_by_login_user_id = ?
            ORDER BY v.created_at DESC
          `,
            [loginUserId],
          );
        }

        return NextResponse.json({
          success: true,
          data: mapVenueRows(result.rows),
        });
      }
    }

    // scopeなし: 後方互換（全会場返却）
    const result = await db.execute(`
      SELECT
        v.venue_id,
        v.venue_name,
        v.address,
        v.prefecture_id,
        p.prefecture_name,
        v.available_courts,
        v.google_maps_url,
        v.latitude,
        v.longitude,
        v.is_active,
        v.is_shared,
        v.created_by_login_user_id,
        v.created_at,
        v.updated_at
      FROM m_venues v
      LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
      ORDER BY v.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      data: mapVenueRows(result.rows),
    });
  } catch (error) {
    console.error("会場一覧取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "会場データの取得に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVenueRows(rows: any[]) {
  return rows.map((row) => ({
    venue_id: Number(row.venue_id),
    venue_name: String(row.venue_name),
    address: row.address ? String(row.address) : null,
    prefecture_id: row.prefecture_id ? Number(row.prefecture_id) : null,
    prefecture_name: row.prefecture_name ? String(row.prefecture_name) : null,
    available_courts: Number(row.available_courts),
    google_maps_url: row.google_maps_url ? String(row.google_maps_url) : null,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    is_active: Boolean(row.is_active),
    is_shared: Boolean(row.is_shared),
    created_by_login_user_id: row.created_by_login_user_id
      ? Number(row.created_by_login_user_id)
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    ...(row.created_by_name !== undefined
      ? { created_by_name: row.created_by_name ? String(row.created_by_name) : null }
      : {}),
  }));
}

// 新規会場の作成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const body = await request.json();
    const {
      venue_name,
      address,
      prefecture_id,
      available_courts,
      is_active,
      google_maps_url,
      latitude,
      longitude,
      is_shared,
    } = body;

    // バリデーション
    if (!venue_name || !venue_name.trim()) {
      return NextResponse.json(
        { success: false, error: "会場名を入力してください" },
        { status: 400 },
      );
    }

    if (!address || !address.trim()) {
      return NextResponse.json(
        { success: false, error: "住所を入力してください" },
        { status: 400 },
      );
    }

    if (!available_courts || available_courts < 1) {
      return NextResponse.json(
        { success: false, error: "利用可能コート数は1以上で入力してください" },
        { status: 400 },
      );
    }

    // 同名会場の重複チェック
    const existingVenue = await db.execute(
      `
      SELECT venue_id FROM m_venues WHERE venue_name = ?
    `,
      [venue_name.trim()],
    );

    if (existingVenue.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: "同じ名前の会場が既に登録されています" },
        { status: 400 },
      );
    }

    // superadminのみis_sharedを設定可能
    const sharedValue = session.user.isSuperadmin && is_shared ? 1 : 0;

    // 会場を作成
    const result = await db.execute(
      `
      INSERT INTO m_venues (venue_name, address, prefecture_id, available_courts, google_maps_url, latitude, longitude, is_active, created_by_login_user_id, is_shared, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `,
      [
        venue_name.trim(),
        address.trim(),
        prefecture_id ? Number(prefecture_id) : null,
        Number(available_courts),
        google_maps_url ? String(google_maps_url).trim() : null,
        latitude != null ? Number(latitude) : null,
        longitude != null ? Number(longitude) : null,
        Boolean(is_active) ? 1 : 0,
        session.user.loginUserId,
        sharedValue,
      ],
    );

    return NextResponse.json({
      success: true,
      data: {
        venue_id: Number(result.lastInsertRowid),
        venue_name: venue_name.trim(),
        address: address.trim(),
        prefecture_id: prefecture_id ? Number(prefecture_id) : null,
        available_courts: Number(available_courts),
        google_maps_url: google_maps_url || null,
        latitude: latitude != null ? Number(latitude) : null,
        longitude: longitude != null ? Number(longitude) : null,
        is_active: Boolean(is_active),
        is_shared: Boolean(sharedValue),
        created_by_login_user_id: session.user.loginUserId,
      },
      message: "会場が正常に作成されました",
    });
  } catch (error) {
    console.error("会場作成エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "会場の作成に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
