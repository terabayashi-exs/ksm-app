import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recalculateUsage } from '@/lib/subscription/subscription-service';

// GET: 全大会グループ（現オーナー情報付き）＋ adminロール持ちユーザー一覧
export async function GET() {
  const session = await auth();
  const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
  if (!isSuperadmin) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  // 大会グループ一覧（現オーナー情報付き）
  const groupsResult = await db.execute(`
    SELECT
      tg.group_id,
      tg.group_name,
      tg.organizer,
      tg.event_start_date,
      tg.event_end_date,
      tg.admin_login_id,
      tg.login_user_id,
      u.display_name AS owner_display_name,
      u.email AS owner_email,
      (SELECT COUNT(*) FROM t_tournaments t WHERE t.group_id = tg.group_id) AS tournament_count
    FROM t_tournament_groups tg
    LEFT JOIN m_login_users u ON tg.login_user_id = u.login_user_id
    ORDER BY tg.event_start_date DESC, tg.group_id DESC
  `);

  // legacy admin_login_id のみのグループのオーナー情報を解決
  const groups = await Promise.all(groupsResult.rows.map(async (row) => {
    let ownerDisplayName = row.owner_display_name ? String(row.owner_display_name) : null;
    let ownerEmail = row.owner_email ? String(row.owner_email) : null;
    let ownerLoginUserId = row.login_user_id ? Number(row.login_user_id) : null;

    if (!ownerLoginUserId && row.admin_login_id) {
      // legacy: m_administrators 経由で解決
      const legacyResult = await db.execute(`
        SELECT u.login_user_id, u.display_name, u.email
        FROM m_administrators a
        INNER JOIN m_login_users u ON a.email = u.email
        WHERE a.admin_login_id = ?
        LIMIT 1
      `, [row.admin_login_id]);
      if (legacyResult.rows.length > 0) {
        ownerLoginUserId = Number(legacyResult.rows[0].login_user_id);
        ownerDisplayName = String(legacyResult.rows[0].display_name);
        ownerEmail = String(legacyResult.rows[0].email);
      }
    }

    return {
      group_id: Number(row.group_id),
      group_name: String(row.group_name),
      organizer: row.organizer ? String(row.organizer) : null,
      event_start_date: row.event_start_date ? String(row.event_start_date) : null,
      event_end_date: row.event_end_date ? String(row.event_end_date) : null,
      tournament_count: Number(row.tournament_count),
      current_owner: ownerLoginUserId ? {
        login_user_id: ownerLoginUserId,
        display_name: ownerDisplayName,
        email: ownerEmail,
      } : null,
      legacy_admin_login_id: row.admin_login_id ? String(row.admin_login_id) : null,
    };
  }));

  // adminロール持ちユーザー一覧
  const usersResult = await db.execute(`
    SELECT u.login_user_id, u.display_name, u.email
    FROM m_login_users u
    INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
    WHERE r.role = 'admin' AND u.is_active = 1
    ORDER BY u.display_name
  `);

  const adminUsers = usersResult.rows.map(row => ({
    login_user_id: Number(row.login_user_id),
    display_name: String(row.display_name),
    email: String(row.email),
  }));

  return NextResponse.json({ success: true, groups, admin_users: adminUsers });
}

// POST: オーナー移管実行
export async function POST(request: NextRequest) {
  const session = await auth();
  const isSuperadmin = !!(session?.user as { isSuperadmin?: boolean })?.isSuperadmin;
  if (!isSuperadmin) {
    return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
  }

  const { group_id, new_owner_login_user_id } = await request.json();

  if (!group_id || !new_owner_login_user_id) {
    return NextResponse.json({ success: false, error: 'group_id と new_owner_login_user_id が必要です' }, { status: 400 });
  }

  // グループ存在確認
  const groupResult = await db.execute(
    `SELECT group_id, group_name, login_user_id, admin_login_id FROM t_tournament_groups WHERE group_id = ?`,
    [group_id]
  );
  if (groupResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: '大会グループが見つかりません' }, { status: 404 });
  }
  const group = groupResult.rows[0];

  // 新オーナー存在・有効・adminロール確認
  const newOwnerResult = await db.execute(`
    SELECT u.login_user_id, u.display_name, u.email
    FROM m_login_users u
    INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
    WHERE u.login_user_id = ? AND u.is_active = 1 AND r.role = 'admin'
  `, [new_owner_login_user_id]);
  if (newOwnerResult.rows.length === 0) {
    return NextResponse.json({ success: false, error: '指定されたユーザーが見つからないか、adminロールがありません' }, { status: 400 });
  }

  // 旧オーナーのlogin_user_idを解決
  let oldOwnerLoginUserId = group.login_user_id ? Number(group.login_user_id) : null;
  if (!oldOwnerLoginUserId && group.admin_login_id) {
    const legacyResult = await db.execute(`
      SELECT u.login_user_id FROM m_administrators a
      INNER JOIN m_login_users u ON a.email = u.email
      WHERE a.admin_login_id = ? LIMIT 1
    `, [group.admin_login_id]);
    if (legacyResult.rows.length > 0) {
      oldOwnerLoginUserId = Number(legacyResult.rows[0].login_user_id);
    }
  }

  // 同一オーナーチェック
  if (oldOwnerLoginUserId === Number(new_owner_login_user_id)) {
    return NextResponse.json({ success: false, error: '現在のオーナーと同じユーザーです' }, { status: 400 });
  }

  // === 移管実行 ===

  // 1. t_tournament_groups のオーナー更新
  await db.execute(
    `UPDATE t_tournament_groups SET login_user_id = ?, admin_login_id = NULL, updated_at = datetime('now', '+9 hours') WHERE group_id = ?`,
    [new_owner_login_user_id, group_id]
  );

  // 2. t_tournaments の created_by 更新
  const updateTournamentsResult = await db.execute(
    `UPDATE t_tournaments SET created_by = ?, updated_at = datetime('now', '+9 hours') WHERE group_id = ?`,
    [String(new_owner_login_user_id), group_id]
  );
  const tournamentCount = updateTournamentsResult.rowsAffected;

  // 3. t_operator_tournament_access の assigned_by 更新（旧オーナーが割り当てたもののみ）
  if (oldOwnerLoginUserId) {
    await db.execute(
      `UPDATE t_operator_tournament_access SET assigned_by_login_user_id = ?
       WHERE assigned_by_login_user_id = ?
       AND tournament_id IN (SELECT tournament_id FROM t_tournaments WHERE group_id = ?)`,
      [new_owner_login_user_id, oldOwnerLoginUserId, group_id]
    );

    // 4. m_login_user_authority の旧オーナーエントリを新オーナーに更新
    await db.execute(
      `UPDATE m_login_user_authority SET login_user_id = ?
       WHERE login_user_id = ?
       AND tournament_id IN (SELECT tournament_id FROM t_tournaments WHERE group_id = ?)`,
      [new_owner_login_user_id, oldOwnerLoginUserId, group_id]
    );
  }

  // 5. サブスクリプション使用状況の再計算
  try {
    if (oldOwnerLoginUserId) {
      await recalculateUsage(String(oldOwnerLoginUserId));
    }
    await recalculateUsage(String(new_owner_login_user_id));
  } catch (e) {
    console.warn('サブスクリプション使用状況の再計算に失敗:', e);
  }

  const newOwner = newOwnerResult.rows[0];
  return NextResponse.json({
    success: true,
    message: '大会グループのオーナーを移管しました',
    transferred: {
      group_id: Number(group.group_id),
      group_name: String(group.group_name),
      tournament_count: Number(tournamentCount),
      to_user: {
        login_user_id: Number(newOwner.login_user_id),
        display_name: String(newOwner.display_name),
        email: String(newOwner.email),
      },
    },
  });
}
