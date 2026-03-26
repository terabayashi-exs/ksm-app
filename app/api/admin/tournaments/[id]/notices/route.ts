import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET: お知らせ一覧取得（管理用・全件）
export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const { id } = await context.params;
  const tournamentId = parseInt(id);

  const result = await db.execute(
    `SELECT * FROM t_tournament_notices WHERE tournament_id = ? ORDER BY display_order DESC, tournament_notice_id DESC`,
    [tournamentId]
  );

  return NextResponse.json({
    success: true,
    notices: result.rows.map(row => ({
      tournament_notice_id: Number(row.tournament_notice_id),
      tournament_id: Number(row.tournament_id),
      content: String(row.content),
      display_order: Number(row.display_order),
      is_active: Number(row.is_active),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    })),
  });
}

// POST: お知らせ新規作成
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const { id } = await context.params;
  const tournamentId = parseInt(id);
  const { content } = await request.json();

  if (!content || !content.trim()) {
    return NextResponse.json({ success: false, error: 'お知らせ内容を入力してください' }, { status: 400 });
  }

  const result = await db.execute(
    `INSERT INTO t_tournament_notices (tournament_id, content, created_at, updated_at)
     VALUES (?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))`,
    [tournamentId, content.trim()]
  );

  return NextResponse.json({
    success: true,
    message: 'お知らせを作成しました',
    notice_id: Number(result.lastInsertRowid),
  });
}

// PUT: お知らせ更新
export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const { id } = await context.params;
  const tournamentId = parseInt(id);
  const { notice_id, content, is_active, display_order } = await request.json();

  if (!notice_id) {
    return NextResponse.json({ success: false, error: 'notice_id が必要です' }, { status: 400 });
  }

  const sets: string[] = [];
  const args: (string | number)[] = [];

  if (content !== undefined) {
    sets.push('content = ?');
    args.push(content.trim());
  }
  if (is_active !== undefined) {
    sets.push('is_active = ?');
    args.push(is_active ? 1 : 0);
  }
  if (display_order !== undefined) {
    sets.push('display_order = ?');
    args.push(display_order);
  }

  if (sets.length === 0) {
    return NextResponse.json({ success: false, error: '更新するフィールドがありません' }, { status: 400 });
  }

  sets.push("updated_at = datetime('now', '+9 hours')");
  args.push(notice_id, tournamentId);

  await db.execute(
    `UPDATE t_tournament_notices SET ${sets.join(', ')} WHERE tournament_notice_id = ? AND tournament_id = ?`,
    args
  );

  return NextResponse.json({ success: true, message: 'お知らせを更新しました' });
}

// DELETE: お知らせ削除
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const { id } = await context.params;
  const tournamentId = parseInt(id);
  const { notice_id } = await request.json();

  if (!notice_id) {
    return NextResponse.json({ success: false, error: 'notice_id が必要です' }, { status: 400 });
  }

  await db.execute(
    `DELETE FROM t_tournament_notices WHERE tournament_notice_id = ? AND tournament_id = ?`,
    [notice_id, tournamentId]
  );

  return NextResponse.json({ success: true, message: 'お知らせを削除しました' });
}
