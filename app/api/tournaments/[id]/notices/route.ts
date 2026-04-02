import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET: 公開お知らせ一覧（認証不要）
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const tournamentId = parseInt(id);

  const result = await db.execute(
    `SELECT tournament_notice_id, content, display_order, created_at, updated_at
     FROM t_tournament_notices
     WHERE tournament_id = ? AND is_active = 1
     ORDER BY display_order DESC, tournament_notice_id DESC`,
    [tournamentId]
  );

  return NextResponse.json({
    success: true,
    notices: result.rows.map(row => ({
      tournament_notice_id: Number(row.tournament_notice_id),
      content: String(row.content),
      display_order: Number(row.display_order),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
    })),
  });
}
