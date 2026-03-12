// app/api/tournament-groups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canCreateTournamentGroup } from '@/lib/subscription/plan-checker';
import { recalculateUsage, checkTrialExpiredPermission } from '@/lib/subscription/subscription-service';
import { calculateTournamentStatus } from '@/lib/tournament-status';

// 大会一覧取得
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const isAdmin = userId === 'admin';

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    const params: (string | number)[] = [];

    let query = `
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        tg.event_start_date,
        tg.event_end_date,
        tg.recruitment_start_date,
        tg.recruitment_end_date,
        tg.visibility,
        tg.event_description,
        tg.created_at,
        tg.updated_at,
        v.venue_name,
        COUNT(DISTINCT t.tournament_id) as division_count
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      LEFT JOIN t_tournaments t ON tg.group_id = t.group_id
      WHERE 1=1
    `;

    // 作成者フィルタリング（adminユーザー以外は自分が作成した大会のみ）
    if (!isAdmin) {
      const parsedUserId = Number(userId);
      if (!isNaN(parsedUserId) && parsedUserId > 0) {
        // 新プロバイダー: login_user_id で絞り込み
        query += ` AND (tg.login_user_id = ? OR (tg.login_user_id IS NULL AND tg.admin_login_id = (
          SELECT a.admin_login_id FROM m_administrators a
          INNER JOIN m_login_users u ON a.email = u.email
          WHERE u.login_user_id = ? LIMIT 1
        )))`;
        params.push(parsedUserId, parsedUserId);
      } else {
        // 旧プロバイダー: admin_login_id で絞り込み
        query += ` AND tg.admin_login_id = ?`;
        params.push(userId);
      }
    }

    query += `
      GROUP BY tg.group_id
      ORDER BY tg.event_start_date DESC, tg.created_at DESC
    `;

    const result = await db.execute(query, params);

    // include_inactive=falseの場合、全部門が完了している大会を除外
    let filteredRows = result.rows;
    if (!includeInactive) {
      // 各大会グループの部門ステータスを確認
      const rowsWithStatus = await Promise.all(result.rows.map(async (row) => {
        // このグループに属する部門（tournaments）を取得
        const divisionsResult = await db.execute(`
          SELECT
            tournament_id,
            status,
            tournament_dates,
            recruitment_start_date,
            recruitment_end_date,
            public_start_date
          FROM t_tournaments
          WHERE group_id = ?
        `, [row.group_id]);

        const divisions = divisionsResult.rows;

        // 部門が存在しない場合は除外（作成中）
        if (divisions.length === 0) {
          return { ...row, shouldInclude: false };
        }

        // 各部門の動的ステータスを計算（管理者ダッシュボードと同じロジック）
        const calculatedStatuses = await Promise.all(
          divisions.map(async (division) => {
            return await calculateTournamentStatus({
              status: division.status as string,
              tournament_dates: division.tournament_dates as string,
              recruitment_start_date: division.recruitment_start_date as string | null,
              recruitment_end_date: division.recruitment_end_date as string | null,
              public_start_date: division.public_start_date as string | null,
            }, Number(division.tournament_id));
          })
        );

        // 全ての部門が'completed'かどうかをチェック
        const allCompleted = calculatedStatuses.every(status => status === 'completed');

        return { ...row, shouldInclude: !allCompleted };
      }));

      // shouldInclude=trueのもののみフィルタ
      filteredRows = rowsWithStatus
        .filter(row => row.shouldInclude)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ shouldInclude, ...rest }) => rest);
    }

    return NextResponse.json({
      success: true,
      data: filteredRows
    });
  } catch (error) {
    console.error('大会一覧取得エラー:', error);
    return NextResponse.json(
      { error: '大会一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会作成
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // 期限切れチェック（新規作成）
    const permissionCheck = await checkTrialExpiredPermission(
      session.user.id,
      'canCreateNew'
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json(
        {
          error: permissionCheck.reason,
          trialExpired: true
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      group_name,
      organizer,
      venue_id,
      event_start_date,
      event_end_date,
      recruitment_start_date,
      recruitment_end_date,
      visibility = 'open',
      event_description
    } = body;

    // バリデーション
    if (!group_name) {
      return NextResponse.json(
        { error: '大会名は必須です' },
        { status: 400 }
      );
    }

    // プラン制限チェック
    const sessionId = session.user.id;
    const planCheck = await canCreateTournamentGroup(sessionId);

    if (!planCheck.allowed) {
      return NextResponse.json(
        {
          error: planCheck.reason,
          current: planCheck.current,
          limit: planCheck.limit,
          planLimitExceeded: true
        },
        { status: 403 }
      );
    }

    // login_user_id を解決
    // 新プロバイダー: session.user.id が数値文字列 → そのまま使用
    // 旧プロバイダー: admin_login_id 文字列 → m_administrators のメールで m_login_users を検索
    let resolvedLoginUserId: number | null = null;
    let resolvedAdminLoginId: string | null = null;

    const parsedId = Number(sessionId);
    if (!isNaN(parsedId) && parsedId > 0) {
      // 新プロバイダー
      resolvedLoginUserId = parsedId;
      // admin_login_id も可能なら埋める（後方互換）
      const adminResult = await db.execute(
        `SELECT a.admin_login_id FROM m_administrators a
         INNER JOIN m_login_users u ON a.email = u.email
         WHERE u.login_user_id = ? LIMIT 1`,
        [parsedId]
      );
      resolvedAdminLoginId = adminResult.rows.length > 0
        ? String(adminResult.rows[0].admin_login_id)
        : null;
    } else {
      // 旧プロバイダー: admin_login_id から m_login_users を検索
      resolvedAdminLoginId = sessionId;
      const userResult = await db.execute(
        `SELECT u.login_user_id FROM m_login_users u
         INNER JOIN m_administrators a ON a.email = u.email
         WHERE a.admin_login_id = ? LIMIT 1`,
        [sessionId]
      );
      resolvedLoginUserId = userResult.rows.length > 0
        ? Number(userResult.rows[0].login_user_id)
        : null;
    }

    // 大会作成
    const result = await db.execute(`
      INSERT INTO t_tournament_groups (
        group_name,
        organizer,
        venue_id,
        event_start_date,
        event_end_date,
        recruitment_start_date,
        recruitment_end_date,
        visibility,
        event_description,
        admin_login_id,
        login_user_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      group_name,
      organizer || null,
      venue_id || null,
      event_start_date || null,
      event_end_date || null,
      recruitment_start_date || null,
      recruitment_end_date || null,
      visibility,
      event_description || null,
      resolvedAdminLoginId,
      resolvedLoginUserId,
    ]);

    const groupId = Number(result.lastInsertRowid);

    // 使用状況を更新
    await recalculateUsage(sessionId);

    // 作成した大会を取得
    const createdGroup = await db.execute(`
      SELECT
        tg.group_id,
        tg.group_name,
        tg.organizer,
        tg.venue_id,
        tg.event_start_date,
        tg.event_end_date,
        tg.recruitment_start_date,
        tg.recruitment_end_date,
        tg.visibility,
        tg.event_description,
        tg.created_at,
        tg.updated_at,
        v.venue_name
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      WHERE tg.group_id = ?
    `, [groupId]);

    return NextResponse.json({
      success: true,
      data: createdGroup.rows[0],
      message: '大会を作成しました'
    });
  } catch (error) {
    console.error('大会作成エラー:', error);
    return NextResponse.json(
      { error: '大会の作成に失敗しました' },
      { status: 500 }
    );
  }
}
