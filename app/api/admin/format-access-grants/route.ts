import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = 'nodejs';

// GET: アクセス付与一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    if (!session.user.isSuperadmin) {
      return NextResponse.json({ error: "スーパー管理者権限が必要です" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const formatId = searchParams.get("format_id");
    const loginUserId = searchParams.get("login_user_id");
    const searchUsers = searchParams.get("search_users");

    // ユーザー検索モード（admin/operatorロールを持つユーザーのみ）
    if (searchUsers) {
      const userResult = await db.execute(`
        SELECT DISTINCT u.login_user_id, u.display_name, u.email
        FROM m_login_users u
        INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
        WHERE u.is_active = 1
          AND r.role = 'admin'
          AND (u.display_name LIKE ? OR u.email LIKE ?)
        ORDER BY u.display_name
        LIMIT 20
      `, [`%${searchUsers}%`, `%${searchUsers}%`]);

      return NextResponse.json({
        success: true,
        users: userResult.rows,
      });
    }

    let sql = `
      SELECT
        g.grant_id,
        g.format_id,
        g.login_user_id,
        g.granted_by_login_user_id,
        g.granted_at,
        g.expires_at,
        g.notes,
        u.display_name as user_display_name,
        u.email as user_email,
        gb.display_name as granted_by_display_name,
        f.format_name
      FROM t_format_access_grants g
      LEFT JOIN m_login_users u ON g.login_user_id = u.login_user_id
      LEFT JOIN m_login_users gb ON g.granted_by_login_user_id = gb.login_user_id
      LEFT JOIN m_tournament_formats f ON g.format_id = f.format_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (formatId) {
      sql += ` AND g.format_id = ?`;
      params.push(parseInt(formatId));
    }

    if (loginUserId) {
      sql += ` AND g.login_user_id = ?`;
      params.push(parseInt(loginUserId));
    }

    sql += ` ORDER BY g.granted_at DESC`;

    const result = await db.execute(sql, params);

    return NextResponse.json({
      success: true,
      grants: result.rows,
    });
  } catch (error) {
    console.error("grant一覧取得エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// POST: アクセス付与
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    if (!session.user.isSuperadmin) {
      return NextResponse.json({ error: "スーパー管理者権限が必要です" }, { status: 403 });
    }

    const body = await request.json();
    const { format_id, login_user_id, expires_at, notes } = body;

    if (!format_id || !login_user_id) {
      return NextResponse.json(
        { error: "format_id と login_user_id は必須です" },
        { status: 400 }
      );
    }

    // フォーマット存在確認
    const formatResult = await db.execute(
      `SELECT format_id FROM m_tournament_formats WHERE format_id = ?`,
      [format_id]
    );
    if (formatResult.rows.length === 0) {
      return NextResponse.json({ error: "フォーマットが見つかりません" }, { status: 404 });
    }

    // ユーザー存在確認（admin/operatorロールを持つユーザーのみ）
    const userResult = await db.execute(`
      SELECT DISTINCT u.login_user_id, u.display_name
      FROM m_login_users u
      INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
      WHERE u.login_user_id = ? AND u.is_active = 1 AND r.role = 'admin'
    `, [login_user_id]);
    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "対象ユーザーが見つからないか、大会管理者ではありません" }, { status: 404 });
    }

    // 重複チェック
    const existingResult = await db.execute(
      `SELECT grant_id FROM t_format_access_grants WHERE format_id = ? AND login_user_id = ?`,
      [format_id, login_user_id]
    );
    if (existingResult.rows.length > 0) {
      return NextResponse.json(
        { error: "このユーザーには既にアクセス権が付与されています" },
        { status: 409 }
      );
    }

    const result = await db.execute(`
      INSERT INTO t_format_access_grants (format_id, login_user_id, granted_by_login_user_id, expires_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [format_id, login_user_id, session.user.loginUserId, expires_at || null, notes || null]);

    return NextResponse.json({
      success: true,
      message: "アクセス権を付与しました",
      grant_id: Number(result.lastInsertRowid),
    });
  } catch (error) {
    console.error("grant作成エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

// DELETE: アクセス取消
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 401 });
    }

    if (!session.user.isSuperadmin) {
      return NextResponse.json({ error: "スーパー管理者権限が必要です" }, { status: 403 });
    }

    const body = await request.json();
    const { grant_id } = body;

    if (!grant_id) {
      return NextResponse.json({ error: "grant_id は必須です" }, { status: 400 });
    }

    const result = await db.execute(
      `DELETE FROM t_format_access_grants WHERE grant_id = ?`,
      [grant_id]
    );

    if (!result.rowsAffected || result.rowsAffected === 0) {
      return NextResponse.json({ error: "指定されたgrantが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "アクセス権を取り消しました",
    });
  } catch (error) {
    console.error("grant削除エラー:", error);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}
