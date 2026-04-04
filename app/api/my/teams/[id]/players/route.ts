// app/api/my/teams/[id]/players/route.ts
// チームの選手一覧取得（GET）・選手追加/更新/削除（PUT）
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

async function verifyMembership(teamId: string, loginUserId: number): Promise<boolean> {
  const check = await db.execute(
    `SELECT id FROM m_team_members WHERE team_id = ? AND login_user_id = ? AND is_active = 1`,
    [teamId, loginUserId]
  );
  return check.rows.length > 0;
}

// GET: 選手一覧取得
export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  if (!(await verifyMembership(teamId, loginUserId))) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const result = await db.execute(
    `SELECT player_id, player_name, jersey_number, is_active, created_at, updated_at
     FROM m_players
     WHERE current_team_id = ? AND is_active = 1
     ORDER BY jersey_number ASC NULLS LAST, player_name ASC`,
    [teamId]
  );

  return NextResponse.json({
    success: true,
    data: result.rows.map(row => ({
      player_id: Number(row.player_id),
      player_name: String(row.player_name),
      jersey_number: row.jersey_number != null ? Number(row.jersey_number) : null,
      is_active: Number(row.is_active) === 1,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    })),
  });
}

// PUT: 選手一覧を更新（追加・編集・削除）
export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.loginUserId || session.user.loginUserId === 0) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const { id: teamId } = await context.params;
  const loginUserId = session.user.loginUserId;

  if (!(await verifyMembership(teamId, loginUserId))) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  let body: { players: { player_id?: number; player_name: string; jersey_number?: number | null }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  const { players } = body;

  if (!Array.isArray(players)) {
    return NextResponse.json({ success: false, error: 'リクエストの形式が不正です' }, { status: 400 });
  }
  if (players.length > 100) {
    return NextResponse.json({ success: false, error: '選手は100名以内にしてください' }, { status: 400 });
  }

  // バリデーション
  const names = players.map(p => p.player_name?.trim()).filter(Boolean);
  if (names.length !== players.length) {
    return NextResponse.json({ success: false, error: '選手名は必須です' }, { status: 400 });
  }
  if (new Set(names).size !== names.length) {
    return NextResponse.json({ success: false, error: '選手名が重複しています' }, { status: 400 });
  }
  const jerseyNumbers = players.map(p => p.jersey_number).filter(n => n != null);
  if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
    return NextResponse.json({ success: false, error: '背番号が重複しています' }, { status: 400 });
  }

  const now = `datetime('now', '+9 hours')`;

  // 現在の選手ID一覧
  const currentPlayersRes = await db.execute(
    `SELECT player_id FROM m_players WHERE current_team_id = ? AND is_active = 1`,
    [teamId]
  );
  const currentIds = new Set(currentPlayersRes.rows.map(r => Number(r.player_id)));
  const submittedIds = new Set(players.filter(p => p.player_id).map(p => p.player_id!));

  // 削除（is_active=0）: 現在いるがリクエストにない選手
  for (const id of currentIds) {
    if (!submittedIds.has(id)) {
      await db.execute(
        `UPDATE m_players SET is_active = 0, updated_at = ${now} WHERE player_id = ? AND current_team_id = ?`,
        [id, teamId]
      );
    }
  }

  let updatedCount = 0;
  let insertedCount = 0;

  for (const player of players) {
    const name = player.player_name.trim();
    const jersey = player.jersey_number ?? null;

    if (player.player_id && currentIds.has(player.player_id)) {
      // 更新
      await db.execute(
        `UPDATE m_players SET player_name = ?, jersey_number = ?, updated_at = ${now} WHERE player_id = ? AND current_team_id = ?`,
        [name, jersey, player.player_id, teamId]
      );
      updatedCount++;
    } else {
      // 新規追加
      await db.execute(
        `INSERT INTO m_players (player_name, jersey_number, current_team_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ${now}, ${now})`,
        [name, jersey, teamId]
      );
      insertedCount++;
    }
  }

  const deactivatedCount = currentIds.size - submittedIds.size > 0 ? currentIds.size - submittedIds.size : 0;

  return NextResponse.json({
    success: true,
    message: '選手情報を更新しました',
    data: { updated_count: updatedCount, inserted_count: insertedCount, deactivated_count: deactivatedCount },
  });
}
