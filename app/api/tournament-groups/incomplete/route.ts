// app/api/tournament-groups/incomplete/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    console.log("[incomplete API] session:", JSON.stringify(session, null, 2));

    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    // 管理者権限チェック（roles配列または role でチェック）
    const user = session.user as {
      loginUserId?: number;
      role?: string;
      roles?: string[];
      isSuperadmin?: boolean;
    };

    const isAdmin = user.roles?.includes("admin") || user.role === "admin";

    if (!isAdmin) {
      console.log(
        "[incomplete API] 管理者権限なし。user.roles:",
        user.roles,
        "user.role:",
        user.role,
      );
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 403 });
    }

    // login_user_idを取得
    const loginUserId = user.loginUserId;
    const isSuperadmin = user.isSuperadmin || false;
    console.log("[incomplete API] loginUserId:", loginUserId);
    console.log("[incomplete API] isSuperadmin:", isSuperadmin);

    // 旧ログイン（loginUserId=0）の場合、スーパー管理者でなければエラー
    if ((!loginUserId || loginUserId === 0) && !isSuperadmin) {
      console.warn(
        "[incomplete API] ⚠️ 旧ログインが検出されました。統合ログイン（m_login_users）を使用してください。",
      );
      return NextResponse.json(
        {
          success: false,
          error: "統合ログインを使用してください",
          details:
            "旧ログイン方式では作成中の大会が表示されません。m_login_usersを使った統合ログインでログインし直してください。",
        },
        { status: 400 },
      );
    }

    // デバッグ：全ての部門なしグループを確認
    const debugAllGroups = await db.execute(`
      SELECT
        g.group_id,
        g.group_name,
        g.login_user_id,
        COUNT(t.tournament_id) as tournament_count
      FROM t_tournament_groups g
      LEFT JOIN t_tournaments t ON g.group_id = t.group_id
      GROUP BY g.group_id, g.group_name, g.login_user_id
      HAVING COUNT(t.tournament_id) = 0
      ORDER BY g.created_at DESC
    `);
    console.log(
      "[incomplete API] 【デバッグ】全ての部門なしグループ:",
      debugAllGroups.rows.map((r) => ({
        group_id: r.group_id,
        group_name: r.group_name,
        login_user_id: r.login_user_id,
        tournament_count: r.tournament_count,
      })),
    );

    // 【パターン1】大会グループを取得し、それぞれに紐づく部門数をカウント
    // スーパー管理者は全て、通常管理者は自分が作成したグループのみ
    let groupResult;
    if (isSuperadmin) {
      // スーパー管理者：全ての部門なしグループを取得
      groupResult = await db.execute(`
        SELECT
          g.group_id,
          g.group_name,
          g.event_description,
          g.organizer,
          g.venue_id,
          g.created_at,
          g.updated_at,
          COUNT(t.tournament_id) as tournament_count
        FROM t_tournament_groups g
        LEFT JOIN t_tournaments t ON g.group_id = t.group_id
        GROUP BY
          g.group_id,
          g.group_name,
          g.event_description,
          g.organizer,
          g.venue_id,
          g.created_at,
          g.updated_at
        HAVING COUNT(t.tournament_id) = 0
        ORDER BY g.created_at DESC
      `);
    } else {
      // 通常管理者：自分が作成したグループのみ
      if (!loginUserId) {
        throw new Error("loginUserId is required for non-superadmin users");
      }
      groupResult = await db.execute(
        `
        SELECT
          g.group_id,
          g.group_name,
          g.event_description,
          g.organizer,
          g.venue_id,
          g.created_at,
          g.updated_at,
          COUNT(t.tournament_id) as tournament_count
        FROM t_tournament_groups g
        LEFT JOIN t_tournaments t ON g.group_id = t.group_id
        WHERE g.login_user_id = ?
        GROUP BY
          g.group_id,
          g.group_name,
          g.event_description,
          g.organizer,
          g.venue_id,
          g.created_at,
          g.updated_at
        HAVING COUNT(t.tournament_id) = 0
        ORDER BY g.created_at DESC
      `,
        [loginUserId],
      );
    }

    // 【パターン2】大会が作成されたが、グループに紐づいていない（group_id = NULL）
    // スーパー管理者は全て、通常管理者は自分が作成したもののみ
    let orphanResult;
    if (isSuperadmin) {
      // スーパー管理者：全ての部門なし大会を取得
      orphanResult = await db.execute(`
        SELECT
          tournament_id,
          tournament_name,
          created_at,
          updated_at
        FROM t_tournaments
        WHERE group_id IS NULL
        ORDER BY created_at DESC
      `);
    } else {
      // 通常管理者：自分が作成したもののみ
      if (!loginUserId) {
        throw new Error("loginUserId is required for non-superadmin users");
      }
      orphanResult = await db.execute(
        `
        SELECT
          tournament_id,
          tournament_name,
          created_at,
          updated_at
        FROM t_tournaments
        WHERE group_id IS NULL
          AND created_by = ?
        ORDER BY created_at DESC
      `,
        [String(loginUserId)],
      );
    }

    console.log("[incomplete API] グループあり部門なし:", groupResult.rows.length, "件");
    console.log("[incomplete API] 大会あり部門なし:", orphanResult.rows.length, "件");

    // パターン1のデータを変換
    const incompleteGroups = groupResult.rows.map((row) => ({
      group_id: Number(row.group_id),
      group_name: String(row.group_name),
      event_description: row.event_description ? String(row.event_description) : null,
      organizer: row.organizer ? String(row.organizer) : null,
      venue_id: row.venue_id ? Number(row.venue_id) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      tournament_count: Number(row.tournament_count),
    }));

    // パターン2のデータを変換（tournament_idを負数にして区別）
    const orphanTournaments = orphanResult.rows.map((row) => ({
      group_id: -Number(row.tournament_id), // 負数にすることでグループと区別
      group_name: `${String(row.tournament_name)}（部門未設定）`,
      event_description: null,
      organizer: null,
      venue_id: null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      tournament_count: 0,
      is_orphan_tournament: true, // フラグを追加
      original_tournament_id: Number(row.tournament_id), // 元のIDを保持
    }));

    // 両方を結合して返す
    const allIncomplete = [...incompleteGroups, ...orphanTournaments];

    return NextResponse.json({
      success: true,
      data: allIncomplete,
    });
  } catch (error) {
    console.error("作成中の大会取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "作成中の大会データの取得に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
