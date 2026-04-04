import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    const roles = (session?.user?.roles ?? []) as string[];
    const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
    if (!roles.includes('admin') && !isSuperadmin) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
    }

    const { tournament_team_id, new_team_id } = await request.json();

    if (!tournament_team_id || !new_team_id) {
      return NextResponse.json(
        { success: false, error: 'tournament_team_id と new_team_id が必要です' },
        { status: 400 }
      );
    }

    // 対象の tournament_team レコードを確認
    const ttResult = await db.execute(
      `SELECT tournament_team_id, tournament_id, team_id, team_name FROM t_tournament_teams WHERE tournament_team_id = ?`,
      [tournament_team_id]
    );
    if (ttResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された大会チームが見つかりません' },
        { status: 404 }
      );
    }

    const currentRecord = ttResult.rows[0];
    const oldTeamId = String(currentRecord.team_id);

    // 新しいチームの存在確認
    const newTeamResult = await db.execute(
      `SELECT team_id, team_name, team_omission FROM m_teams WHERE team_id = ?`,
      [new_team_id]
    );
    if (newTeamResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された新しいチームが見つかりません' },
        { status: 404 }
      );
    }

    const newTeam = newTeamResult.rows[0];

    // team_id のみ更新（チーム名・略称はそのまま維持）
    await db.execute(`
      UPDATE t_tournament_teams
      SET team_id = ?, updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [
      String(newTeam.team_id),
      tournament_team_id,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tournament_team_id: Number(tournament_team_id),
        old_team_id: oldTeamId,
        old_team_name: String(currentRecord.team_name ?? ''),
        new_team_id: String(newTeam.team_id),
        new_team_name: String(newTeam.team_name ?? ''),
      },
    });
  } catch (error) {
    console.error('[DATA_REG] reassign-team error:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
