import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string; tournamentTeamId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '管理者権限が必要です' }, { status: 401 });
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);
    const tournamentTeamId = parseInt(resolvedParams.tournamentTeamId);

    if (isNaN(tournamentId) || isNaN(tournamentTeamId)) {
      return NextResponse.json({ success: false, error: '無効なIDです' }, { status: 400 });
    }

    const body = await request.json();
    const { team_name, team_omission } = body;

    if (!team_name || typeof team_name !== 'string' || team_name.trim() === '') {
      return NextResponse.json({ success: false, error: 'チーム名は必須です' }, { status: 400 });
    }

    // チームの存在確認
    const teamResult = await db.execute(`
      SELECT tournament_team_id, team_name, team_omission
      FROM t_tournament_teams
      WHERE tournament_id = ? AND tournament_team_id = ?
    `, [tournamentId, tournamentTeamId]);

    if (teamResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'チームが見つかりません' }, { status: 404 });
    }

    const oldName = String(teamResult.rows[0].team_name);
    const oldOmission = String(teamResult.rows[0].team_omission);
    const newName = team_name.trim();
    const newOmission = (team_omission && typeof team_omission === 'string' && team_omission.trim() !== '')
      ? team_omission.trim()
      : newName;

    // 1. t_tournament_teams を更新
    await db.execute(`
      UPDATE t_tournament_teams
      SET team_name = ?, team_omission = ?, updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [newName, newOmission, tournamentTeamId]);

    // 2. t_matches_live の display_name を連動更新
    // team1 の更新（旧略称または旧名称で表示されている場合）
    await db.execute(`
      UPDATE t_matches_live
      SET team1_display_name = ?,
          updated_at = datetime('now', '+9 hours')
      WHERE team1_tournament_team_id = ?
        AND match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)
    `, [newOmission, tournamentTeamId, tournamentId]);

    // team2 の更新
    await db.execute(`
      UPDATE t_matches_live
      SET team2_display_name = ?,
          updated_at = datetime('now', '+9 hours')
      WHERE team2_tournament_team_id = ?
        AND match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)
    `, [newOmission, tournamentTeamId, tournamentId]);

    console.log(`[TEAM_NAME] Tournament ${tournamentId}, Team ${tournamentTeamId}: "${oldName}"(${oldOmission}) → "${newName}"(${newOmission}) by ${session.user.email}`);

    return NextResponse.json({
      success: true,
      message: 'チーム名を更新しました',
      data: {
        tournament_team_id: tournamentTeamId,
        old_name: oldName,
        old_omission: oldOmission,
        new_name: newName,
        new_omission: newOmission
      }
    });

  } catch (error) {
    console.error('Team name update error:', error);
    return NextResponse.json(
      { success: false, error: 'チーム名の更新に失敗しました' },
      { status: 500 }
    );
  }
}
