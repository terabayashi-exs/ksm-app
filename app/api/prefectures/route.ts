// app/api/prefectures/route.ts
// 都道府県マスタを取得するAPI

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.execute(`
      SELECT
        prefecture_id,
        prefecture_name,
        prefecture_code,
        region_name,
        display_order
      FROM m_prefectures
      WHERE is_active = 1
      ORDER BY display_order ASC
    `);

    const prefectures = result.rows.map((row) => ({
      prefecture_id: Number(row.prefecture_id),
      prefecture_name: String(row.prefecture_name),
      prefecture_code: String(row.prefecture_code),
      region_name: String(row.region_name),
      display_order: Number(row.display_order),
    }));

    return NextResponse.json({
      success: true,
      prefectures,
    });
  } catch (error) {
    console.error("Error fetching prefectures:", error);
    return NextResponse.json(
      { success: false, error: "都道府県の取得に失敗しました" },
      { status: 500 },
    );
  }
}
