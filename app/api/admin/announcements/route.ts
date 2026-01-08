// app/api/admin/announcements/route.ts
// 管理者用お知らせ管理API（一覧取得・作成）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// お知らせ一覧取得（管理者用：全件取得）
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const result = await db.execute(`
      SELECT
        a.announcement_id,
        a.title,
        a.content,
        a.status,
        a.display_order,
        a.created_by,
        a.created_at,
        a.updated_at
      FROM t_announcements a
      ORDER BY a.display_order ASC, a.created_at DESC
    `);

    return NextResponse.json({
      announcements: result.rows,
    });
  } catch (error) {
    console.error('お知らせ取得エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// お知らせ作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, status, display_order } = body;

    // バリデーション
    if (!title || !content) {
      return NextResponse.json(
        { error: 'タイトルと本文は必須です' },
        { status: 400 }
      );
    }

    if (status && !['draft', 'published'].includes(status)) {
      return NextResponse.json(
        { error: 'ステータスはdraftまたはpublishedのみ有効です' },
        { status: 400 }
      );
    }

    const result = await db.execute(
      `
      INSERT INTO t_announcements (
        title,
        content,
        status,
        display_order,
        created_by
      ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        title,
        content,
        status || 'draft',
        display_order !== undefined ? display_order : 0,
        session.user.id,
      ]
    );

    return NextResponse.json({
      success: true,
      announcement_id: Number(result.lastInsertRowid),
      message: 'お知らせを作成しました',
    });
  } catch (error) {
    console.error('お知らせ作成エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの作成に失敗しました' },
      { status: 500 }
    );
  }
}
