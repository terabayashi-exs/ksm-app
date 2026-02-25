// app/api/my/teams/[id]/tournaments/past/route.ts
// チームが過去に参加した大会一覧を返す（完了した大会のみ）
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  // 担当者チェック
  const memberCheck = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  if (memberCheck.rows.length === 0) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  // 過去に参加した大会（完了ステータスのもの）
  const pastRes = await db.execute(`
    SELECT
      t.tournament_id,
      t.tournament_name,
      tg.event_start_date,
      tg.event_end_date,
      v.venue_name,
      p.prefecture_name,
      t.sport_type_id,
      tg.group_id,
      tg.group_name,
      lu.logo_blob_url
    FROM t_tournament_teams tt
    JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    LEFT JOIN m_prefectures p ON v.prefecture_id = p.prefecture_id
    LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
    LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
    WHERE tt.team_id = ?
      AND t.status = 'completed'
      AND t.is_archived = 0
    GROUP BY t.tournament_id
    ORDER BY tg.event_end_date DESC, t.tournament_id DESC
  `, [teamId]);

  return NextResponse.json({
    success: true,
    data: pastRes.rows.map(row => ({
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      event_start_date: row.event_start_date ? String(row.event_start_date) : null,
      event_end_date: row.event_end_date ? String(row.event_end_date) : null,
      venue_name: row.venue_name ? String(row.venue_name) : null,
      prefecture_name: row.prefecture_name ? String(row.prefecture_name) : null,
      sport_type_id: row.sport_type_id ? Number(row.sport_type_id) : null,
      tournament_group_id: row.group_id ? Number(row.group_id) : null,
      group_name: row.group_name ? String(row.group_name) : null,
      logo_blob_url: row.logo_blob_url ? String(row.logo_blob_url) : null,
    })),
  });
}
