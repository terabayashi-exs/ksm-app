// app/api/tournament-groups/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// 個別大会取得（所属部門含む）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    // 大会基本情報取得
    const groupResult = await db.execute(`
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
        v.address as venue_address
      FROM t_tournament_groups tg
      LEFT JOIN m_venues v ON tg.venue_id = v.venue_id
      WHERE tg.group_id = ?
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const group = groupResult.rows[0];

    // 所属部門一覧取得
    const divisionsResult = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        f.format_name,
        COUNT(DISTINCT tt.team_id) as registered_teams
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
      WHERE t.group_id = ?
      GROUP BY t.tournament_id
      ORDER BY t.created_at DESC
    `, [groupId]);

    return NextResponse.json({
      success: true,
      data: {
        ...group,
        divisions: divisionsResult.rows
      }
    });
  } catch (error) {
    console.error('大会取得エラー:', error);
    return NextResponse.json(
      { error: '大会の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    const body = await request.json();
    const {
      group_name,
      organizer,
      venue_id,
      event_start_date,
      event_end_date,
      recruitment_start_date,
      recruitment_end_date,
      visibility,
      event_description
    } = body;

    // バリデーション
    if (!group_name) {
      return NextResponse.json(
        { error: '大会名は必須です' },
        { status: 400 }
      );
    }

    // 大会存在確認
    const existsResult = await db.execute(`
      SELECT group_id FROM t_tournament_groups WHERE group_id = ?
    `, [groupId]);

    if (existsResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    // 大会更新
    await db.execute(`
      UPDATE t_tournament_groups
      SET
        group_name = ?,
        organizer = ?,
        venue_id = ?,
        event_start_date = ?,
        event_end_date = ?,
        recruitment_start_date = ?,
        recruitment_end_date = ?,
        visibility = ?,
        event_description = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE group_id = ?
    `, [
      group_name,
      organizer || null,
      venue_id || null,
      event_start_date || null,
      event_end_date || null,
      recruitment_start_date || null,
      recruitment_end_date || null,
      visibility || 'open',
      event_description || null,
      groupId
    ]);

    // 更新後の大会を取得
    const updatedGroup = await db.execute(`
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
      data: updatedGroup.rows[0],
      message: '大会を更新しました'
    });
  } catch (error) {
    console.error('大会更新エラー:', error);
    return NextResponse.json(
      { error: '大会の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// 大会削除（所属する全部門も含めて削除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const groupId = parseInt(resolvedParams.id);

    if (isNaN(groupId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会グループの存在確認
    const groupCheck = await db.execute(
      'SELECT group_id, group_name FROM t_tournament_groups WHERE group_id = ?',
      [groupId]
    );

    if (groupCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定された大会が見つかりません' },
        { status: 404 }
      );
    }

    const groupName = groupCheck.rows[0].group_name;

    // 所属する部門の数を確認
    const divisionCount = await db.execute(
      'SELECT COUNT(*) as count FROM t_tournaments WHERE group_id = ?',
      [groupId]
    );

    const totalDivisions = Number(divisionCount.rows[0].count);

    console.log(`大会グループ「${groupName}」(ID: ${groupId}) の削除を開始...`);
    console.log(`所属部門数: ${totalDivisions}件`);

    // 外部キー制約を一時的に無効化（スキーマの問題を回避）
    await db.execute('PRAGMA foreign_keys = OFF');

    try {
      // Step 1: 各部門とその関連データを削除
    if (totalDivisions > 0) {
      // 部門のtournament_idリストを取得
      const tournamentsResult = await db.execute(
        'SELECT tournament_id FROM t_tournaments WHERE group_id = ?',
        [groupId]
      );

      const tournamentIds = tournamentsResult.rows.map(row => Number(row.tournament_id));
      console.log(`削除対象部門ID: ${tournamentIds.join(', ')}`);

      // 各部門について、部門削除と同じ手順で削除
      for (const tournamentId of tournamentIds) {
        console.log(`  部門 ${tournamentId} の削除開始...`);

        // 1-1. 試合関連データを削除（サブクエリ使用）
        try {
          await db.execute(`
            DELETE FROM t_match_status
            WHERE match_block_id IN (
              SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
            )
          `, [tournamentId]);
        } catch {
          console.log('  t_match_status削除スキップ（テーブル不存在またはデータなし）');
        }

        try {
          await db.execute(`
            DELETE FROM t_matches_final
            WHERE match_block_id IN (
              SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
            )
          `, [tournamentId]);
        } catch {
          console.log('  t_matches_final削除スキップ（テーブル不存在またはデータなし）');
        }

        await db.execute(`
          DELETE FROM t_matches_live
          WHERE match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [tournamentId]);

        // 1-2. 大会関連データを削除
        try {
          await db.execute(`
            DELETE FROM t_tournament_notifications WHERE tournament_id = ?
          `, [tournamentId]);
        } catch {
          console.log('  t_tournament_notifications削除スキップ');
        }

        try {
          await db.execute(`
            DELETE FROM t_tournament_rules WHERE tournament_id = ?
          `, [tournamentId]);
        } catch {
          console.log('  t_tournament_rules削除スキップ');
        }

        await db.execute(`
          DELETE FROM t_tournament_players WHERE tournament_id = ?
        `, [tournamentId]);

        await db.execute(`
          DELETE FROM t_tournament_teams WHERE tournament_id = ?
        `, [tournamentId]);

        // 1-3. マッチブロックを削除
        await db.execute(`
          DELETE FROM t_match_blocks WHERE tournament_id = ?
        `, [tournamentId]);

        // 1-4. 部門本体を削除
        await db.execute(`
          DELETE FROM t_tournaments WHERE tournament_id = ?
        `, [tournamentId]);

        console.log(`  ✓ 部門 ${tournamentId} 削除完了`);
      }

      console.log(`✓ ${totalDivisions}件の部門と関連データを削除しました`);
    }

      // Step 2: 大会グループ（t_tournament_groups）を削除
      await db.execute(
        'DELETE FROM t_tournament_groups WHERE group_id = ?',
        [groupId]
      );

      console.log(`✓ 大会グループ「${groupName}」を削除しました`);

      return NextResponse.json({
        success: true,
        message: `大会「${groupName}」と所属する${totalDivisions}件の部門を削除しました`,
        deletedDivisions: totalDivisions
      });

    } finally {
      // 外部キー制約を再度有効化
      await db.execute('PRAGMA foreign_keys = ON');
      console.log('外部キー制約を再度有効化しました');
    }

  } catch (error) {
    console.error('大会グループ削除エラー:', error);
    // エラー時も外部キー制約を再度有効化
    try {
      await db.execute('PRAGMA foreign_keys = ON');
    } catch (fkError) {
      console.error('外部キー制約の再有効化に失敗しました:', fkError);
    }
    return NextResponse.json(
      { success: false, error: '大会グループの削除中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
