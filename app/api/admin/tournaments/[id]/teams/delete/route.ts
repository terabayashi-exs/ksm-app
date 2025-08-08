// app/api/admin/tournaments/[id]/teams/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 管理者認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { teamId } = body;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'チームIDが必要です' },
        { status: 400 }
      );
    }

    console.log('Admin team deletion request:', {
      tournamentId,
      teamId,
      adminId: session.user.id
    });

    // 削除対象チームの詳細情報を取得
    const teamInfoResult = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.team_name as tournament_team_name,
        m.team_name as master_team_name,
        m.registration_type,
        m.contact_email
      FROM t_tournament_teams tt
      INNER JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.tournament_id = ? AND tt.team_id = ?
    `, [tournamentId, teamId]);

    if (teamInfoResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チームが見つかりません' },
        { status: 404 }
      );
    }

    const teamInfo = teamInfoResult.rows[0];

    // 管理者代行登録チームのみ削除可能
    if (teamInfo.registration_type !== 'admin_proxy') {
      return NextResponse.json(
        { 
          success: false, 
          error: '管理者代行登録されたチームのみ削除可能です' 
        },
        { status: 403 }
      );
    }

    // トランザクション開始（削除の順序が重要）
    console.log('Starting team deletion transaction...');

    // 1. 大会参加選手を削除
    await db.execute(`
      DELETE FROM t_tournament_players 
      WHERE tournament_id = ? AND team_id = ?
    `, [tournamentId, teamId]);
    console.log('Deleted tournament players');

    // 2. 大会参加チームを削除
    await db.execute(`
      DELETE FROM t_tournament_teams 
      WHERE tournament_id = ? AND team_id = ?
    `, [tournamentId, teamId]);
    console.log('Deleted tournament team');

    // 3. マスター選手を削除（このチームに所属する選手）
    await db.execute(`
      DELETE FROM m_players 
      WHERE current_team_id = ?
    `, [teamId]);
    console.log('Deleted master players');

    // 4. マスターチームを削除
    await db.execute(`
      DELETE FROM m_teams 
      WHERE team_id = ?
    `, [teamId]);
    console.log('Deleted master team');

    return NextResponse.json({
      success: true,
      message: 'チームを正常に削除しました',
      data: {
        deletedTeam: {
          team_id: teamId,
          tournament_team_name: String(teamInfo.tournament_team_name),
          master_team_name: String(teamInfo.master_team_name),
          contact_email: String(teamInfo.contact_email)
        }
      }
    });

  } catch (error) {
    console.error('Admin team deletion error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'チーム削除に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}