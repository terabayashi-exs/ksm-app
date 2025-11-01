import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/tournament-groups/[id]/tournaments - グループ内大会一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const groupId = parseInt(id);

    // グループ存在確認
    const groupCheck = await db.execute(`
      SELECT group_id FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (groupCheck.rows.length === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // グループに属する大会を取得
    const tournamentsResult = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.category_name,
        t.group_order,
        t.status,
        t.team_count,
        t.tournament_dates,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.group_id = ?
      ORDER BY t.group_order, t.created_at
    `, [groupId]);

    // データを安全に変換
    const safeData = tournamentsResult.rows.map(row => ({
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name || ''),
      category_name: row.category_name ? String(row.category_name) : null,
      group_order: Number(row.group_order || 0),
      status: String(row.status || ''),
      team_count: Number(row.team_count || 0),
      tournament_dates: row.tournament_dates ? String(row.tournament_dates) : null,
      venue_name: row.venue_name ? String(row.venue_name) : null,
      format_name: row.format_name ? String(row.format_name) : null
    }));

    return NextResponse.json({ 
      success: true, 
      data: safeData 
    });

  } catch (error) {
    console.error('グループ内大会一覧取得エラー:', error);
    return NextResponse.json({ 
      error: 'グループ内大会一覧の取得に失敗しました' 
    }, { status: 500 });
  }
}

// PUT /api/tournament-groups/[id]/tournaments - 大会追加・順序更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const groupId = parseInt(id);
    const body = await request.json();

    // グループ存在確認
    const groupCheck = await db.execute(`
      SELECT group_id FROM m_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (groupCheck.rows.length === 0) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // 操作タイプに応じて処理
    if (body.action === 'add') {
      // 大会をグループに追加
      const { tournamentId, categoryName, groupOrder } = body;

      // 大会存在確認
      const tournamentCheck = await db.execute(`
        SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?
      `, [tournamentId]);

      if (tournamentCheck.rows.length === 0) {
        return NextResponse.json({ error: '大会が見つかりません' }, { status: 404 });
      }

      // 大会のグループを更新
      await db.execute(`
        UPDATE t_tournaments 
        SET 
          group_id = ?,
          category_name = ?,
          group_order = ?,
          updated_at = datetime('now', '+9 hours')
        WHERE tournament_id = ?
      `, [groupId, categoryName || null, groupOrder || 0, tournamentId]);

      return NextResponse.json({ 
        success: true, 
        message: '大会をグループに追加しました'
      });

    } else if (body.action === 'reorder') {
      // グループ内の大会の順序を更新
      const { tournaments } = body; // [{ tournament_id, group_order }]

      // 各大会の順序を更新
      for (const tournament of tournaments) {
        await db.execute(`
          UPDATE t_tournaments 
          SET 
            group_order = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ? AND group_id = ?
        `, [tournament.group_order, tournament.tournament_id, groupId]);
      }

      return NextResponse.json({ 
        success: true, 
        message: '大会の順序を更新しました'
      });

    } else if (body.action === 'update_categories') {
      // カテゴリー名を一括更新
      const { tournaments } = body; // [{ tournament_id, category_name }]

      for (const tournament of tournaments) {
        await db.execute(`
          UPDATE t_tournaments 
          SET 
            category_name = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ? AND group_id = ?
        `, [tournament.category_name, tournament.tournament_id, groupId]);
      }

      return NextResponse.json({ 
        success: true, 
        message: 'カテゴリー名を更新しました'
      });
    }

    return NextResponse.json({ 
      error: '無効な操作です' 
    }, { status: 400 });

  } catch (error) {
    console.error('大会グループ更新エラー:', error);
    return NextResponse.json({ 
      error: '大会グループの更新に失敗しました' 
    }, { status: 500 });
  }
}

// DELETE /api/tournament-groups/[id]/tournaments/[tournamentId] - 大会をグループから削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const tournamentId = parseInt(pathSegments[pathSegments.length - 1]);
    const { id } = await params;
    const groupId = parseInt(id);

    // 大会のグループを解除
    const result = await db.execute(`
      UPDATE t_tournaments 
      SET 
        group_id = NULL,
        category_name = NULL,
        group_order = 0,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_id = ? AND group_id = ?
    `, [tournamentId, groupId]);

    if (result.rowsAffected === 0) {
      return NextResponse.json({ 
        error: '指定された大会はこのグループに属していません' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: '大会をグループから削除しました'
    });

  } catch (error) {
    console.error('大会グループ削除エラー:', error);
    return NextResponse.json({ 
      error: '大会のグループ削除に失敗しました' 
    }, { status: 500 });
  }
}