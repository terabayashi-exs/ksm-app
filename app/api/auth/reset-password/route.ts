// app/api/auth/reset-password/route.ts
// パスワードリセット実行API

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "トークンと新しいパスワードが必要です" },
        { status: 400 }
      );
    }

    // パスワードの検証
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で設定してください" },
        { status: 400 }
      );
    }

    // トークンの検証
    const tokenResult = await db.execute(
      `SELECT token_id, team_id, expires_at, used_at
       FROM t_password_reset_tokens
       WHERE reset_token = ?`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json(
        { error: "無効なリセットリンクです" },
        { status: 400 }
      );
    }

    const resetToken = tokenResult.rows[0];

    // トークンが既に使用済みかチェック
    if (resetToken.used_at) {
      return NextResponse.json(
        { error: "このリセットリンクは既に使用されています" },
        { status: 400 }
      );
    }

    // トークンの有効期限チェック
    // データベースに保存されている時刻はJST、現在時刻もJSTで取得して比較
    const nowJSTResult = await db.execute(`SELECT datetime('now', '+9 hours') as now_jst`);
    const nowJST = nowJSTResult.rows[0].now_jst as string;
    const expiresAtJST = resetToken.expires_at as string;

    // デバッグログ
    console.log('Token expiration check:', {
      nowJST,
      expiresAtJST,
      isExpired: nowJST > expiresAtJST,
    });

    if (nowJST > expiresAtJST) {
      return NextResponse.json(
        { error: "リセットリンクの有効期限が切れています。再度パスワードリセットを申請してください。" },
        { status: 400 }
      );
    }

    // パスワードのハッシュ化
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // パスワードの更新
    await db.execute(
      `UPDATE m_teams
       SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE team_id = ?`,
      [passwordHash, resetToken.team_id]
    );

    // トークンを使用済みにマーク（JSTで保存）
    await db.execute(
      `UPDATE t_password_reset_tokens
       SET used_at = datetime('now', '+9 hours')
       WHERE token_id = ?`,
      [resetToken.token_id]
    );

    return NextResponse.json(
      {
        success: true,
        message: "パスワードを変更しました。新しいパスワードでログインしてください。"
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "パスワードリセット処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}

// トークンの検証API（画面表示時の確認用）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { valid: false, error: "トークンが指定されていません" },
        { status: 400 }
      );
    }

    // トークンの検証
    const tokenResult = await db.execute(
      `SELECT token_id, team_id, expires_at, used_at
       FROM t_password_reset_tokens
       WHERE reset_token = ?`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json(
        { valid: false, error: "無効なリセットリンクです" },
        { status: 200 }
      );
    }

    const resetToken = tokenResult.rows[0];

    // トークンが既に使用済みかチェック
    if (resetToken.used_at) {
      return NextResponse.json(
        { valid: false, error: "このリセットリンクは既に使用されています" },
        { status: 200 }
      );
    }

    // トークンの有効期限チェック
    // データベースに保存されている時刻はJST、現在時刻もJSTで取得して比較
    const nowJSTResult = await db.execute(`SELECT datetime('now', '+9 hours') as now_jst`);
    const nowJST = nowJSTResult.rows[0].now_jst as string;
    const expiresAtJST = resetToken.expires_at as string;

    // デバッグログ
    console.log('Token validation check:', {
      nowJST,
      expiresAtJST,
      isExpired: nowJST > expiresAtJST,
    });

    if (nowJST > expiresAtJST) {
      return NextResponse.json(
        { valid: false, error: "リセットリンクの有効期限が切れています" },
        { status: 200 }
      );
    }

    // チーム情報の取得
    const teamResult = await db.execute(
      `SELECT team_id, team_name FROM m_teams WHERE team_id = ?`,
      [resetToken.team_id]
    );

    if (teamResult.rows.length === 0) {
      return NextResponse.json(
        { valid: false, error: "チーム情報が見つかりません" },
        { status: 200 }
      );
    }

    const team = teamResult.rows[0];

    return NextResponse.json(
      {
        valid: true,
        teamId: team.team_id,
        teamName: team.team_name
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Validate token error:", error);
    return NextResponse.json(
      { valid: false, error: "トークン検証中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
