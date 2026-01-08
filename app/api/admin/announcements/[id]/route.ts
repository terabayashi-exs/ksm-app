// app/api/admin/announcements/[id]/route.ts
// 管理者用お知らせ管理API（詳細取得・更新・削除）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// お知らせ詳細取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const resolvedParams = await params;
    const announcementId = parseInt(resolvedParams.id, 10);

    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: '無効なお知らせIDです' },
        { status: 400 }
      );
    }

    const result = await db.execute(
      `
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
      WHERE a.announcement_id = ?
      `,
      [announcementId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'お知らせが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      announcement: result.rows[0],
    });
  } catch (error) {
    console.error('お知らせ取得エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// お知らせ更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const resolvedParams = await params;
    const announcementId = parseInt(resolvedParams.id, 10);

    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: '無効なお知らせIDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, content, status, display_order } = body;

    // バリデーション
    if (title !== undefined && !title) {
      return NextResponse.json(
        { error: 'タイトルは空にできません' },
        { status: 400 }
      );
    }

    if (content !== undefined && !content) {
      return NextResponse.json(
        { error: '本文は空にできません' },
        { status: 400 }
      );
    }

    if (status && !['draft', 'published'].includes(status)) {
      return NextResponse.json(
        { error: 'ステータスはdraftまたはpublishedのみ有効です' },
        { status: 400 }
      );
    }

    // 存在チェック
    const existing = await db.execute(
      'SELECT announcement_id FROM t_announcements WHERE announcement_id = ?',
      [announcementId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: 'お知らせが見つかりません' },
        { status: 404 }
      );
    }

    // 更新フィールドの構築
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (display_order !== undefined) {
      updates.push('display_order = ?');
      values.push(display_order);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: '更新する項目がありません' },
        { status: 400 }
      );
    }

    // updated_atを更新
    updates.push("updated_at = datetime('now', '+9 hours')");
    values.push(announcementId);

    await db.execute(
      `UPDATE t_announcements SET ${updates.join(', ')} WHERE announcement_id = ?`,
      values
    );

    return NextResponse.json({
      success: true,
      message: 'お知らせを更新しました',
    });
  } catch (error) {
    console.error('お知らせ更新エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// お知らせ削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const resolvedParams = await params;
    const announcementId = parseInt(resolvedParams.id, 10);

    if (isNaN(announcementId)) {
      return NextResponse.json(
        { error: '無効なお知らせIDです' },
        { status: 400 }
      );
    }

    // 存在チェック
    const existing = await db.execute(
      'SELECT announcement_id FROM t_announcements WHERE announcement_id = ?',
      [announcementId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: 'お知らせが見つかりません' },
        { status: 404 }
      );
    }

    await db.execute(
      'DELETE FROM t_announcements WHERE announcement_id = ?',
      [announcementId]
    );

    return NextResponse.json({
      success: true,
      message: 'お知らせを削除しました',
    });
  } catch (error) {
    console.error('お知らせ削除エラー:', error);
    return NextResponse.json(
      { error: 'お知らせの削除に失敗しました' },
      { status: 500 }
    );
  }
}
