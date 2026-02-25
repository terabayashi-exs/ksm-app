// app/api/tournament-groups/incomplete/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    console.log('[incomplete API] session:', JSON.stringify(session, null, 2));

    if (!session) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // 管理者権限チェック（roles配列または role でチェック）
    const user = session.user as {
      loginUserId?: number;
      role?: string;
      roles?: string[];
      isSuperadmin?: boolean;
    };

    const isAdmin = user.roles?.includes('admin') || user.role === 'admin';

    if (!isAdmin) {
      console.log('[incomplete API] 管理者権限なし。user.roles:', user.roles, 'user.role:', user.role);
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 403 }
      );
    }

    // login_user_idを取得
    const loginUserId = user.loginUserId;
    console.log('[incomplete API] loginUserId:', loginUserId);
    console.log('[incomplete API] isSuperadmin:', user.isSuperadmin);

    // 旧ログイン（loginUserId=0）の場合は警告を出す
    if (!loginUserId || loginUserId === 0) {
      console.warn('[incomplete API] ⚠️ 旧ログインが検出されました。統合ログイン（m_login_users）を使用してください。');
      return NextResponse.json(
        {
          success: false,
          error: '統合ログインを使用してください',
          details: '旧ログイン方式では作成中の大会が表示されません。m_login_usersを使った統合ログインでログインし直してください。'
        },
        { status: 400 }
      );
    }

    // 大会グループを取得し、それぞれに紐づく部門数をカウント
    // ログインユーザーが作成した大会のみを取得
    const result = await db.execute(`
      SELECT
        g.group_id,
        g.group_name,
        g.event_description,
        g.organizer,
        g.venue_id,
        g.created_at,
        g.updated_at,
        COUNT(t.tournament_id) as tournament_count
      FROM t_tournament_groups g
      LEFT JOIN t_tournaments t ON g.group_id = t.group_id
      WHERE g.login_user_id = ?
      GROUP BY
        g.group_id,
        g.group_name,
        g.event_description,
        g.organizer,
        g.venue_id,
        g.created_at,
        g.updated_at
      HAVING COUNT(t.tournament_id) = 0
      ORDER BY g.created_at DESC
    `, [loginUserId]);

    console.log('[incomplete API] クエリ結果:', result.rows.length, '件');
    if (result.rows.length > 0) {
      console.log('[incomplete API] 取得した大会:', result.rows.map(r => ({
        group_id: r.group_id,
        group_name: r.group_name,
        tournament_count: r.tournament_count
      })));
    } else {
      console.log('[incomplete API] ℹ️ 作成中の大会はありません（loginUserId:', loginUserId, '）');
    }

    const incompleteGroups = result.rows.map(row => ({
      group_id: Number(row.group_id),
      group_name: String(row.group_name),
      event_description: row.event_description ? String(row.event_description) : null,
      organizer: row.organizer ? String(row.organizer) : null,
      venue_id: row.venue_id ? Number(row.venue_id) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      tournament_count: Number(row.tournament_count)
    }));

    return NextResponse.json({
      success: true,
      data: incompleteGroups
    });

  } catch (error) {
    console.error('作成中の大会取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '作成中の大会データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
