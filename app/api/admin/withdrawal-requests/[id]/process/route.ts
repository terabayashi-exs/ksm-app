// app/api/admin/withdrawal-requests/[id]/process/route.ts
// 辞退申請の承認・却下処理API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { processWithdrawalApproval } from '@/lib/withdrawal-processor';
import { sendWithdrawalApprovedNotification, sendWithdrawalRejectedNotification } from '@/lib/withdrawal-notifications';

// 辞退申請の承認・却下処理
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentTeamId = parseInt(resolvedParams.id);
    const { action, admin_comment, send_notification = false } = await request.json();

    // 入力値検証
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ 
        error: 'actionは"approve"または"reject"である必要があります' 
      }, { status: 400 });
    }

    if (admin_comment && admin_comment.length > 500) {
      return NextResponse.json({ 
        error: '管理者コメントは500文字以内で入力してください' 
      }, { status: 400 });
    }

    // 対象の辞退申請を確認
    const withdrawalCheck = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name,
        tt.withdrawal_status,
        tt.withdrawal_reason,
        tt.withdrawal_requested_at,
        t.tournament_name,
        t.status as tournament_status,
        mt.contact_email,
        mt.contact_person
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      INNER JOIN m_teams mt ON tt.team_id = mt.team_id
      WHERE tt.tournament_team_id = ?
    `, [tournamentTeamId]);

    if (withdrawalCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された参加チーム情報が見つかりません' 
      }, { status: 404 });
    }

    const withdrawalRow = withdrawalCheck.rows[0];

    // 申請状態チェック
    if (withdrawalRow.withdrawal_status !== 'withdrawal_requested') {
      return NextResponse.json({ 
        error: '申請中の辞退申請のみ処理できます' 
      }, { status: 400 });
    }

    // WithdrawalInfo型に変換
    const withdrawal = {
      tournament_team_id: withdrawalRow.tournament_team_id as number,
      tournament_id: withdrawalRow.tournament_id as number,
      team_id: withdrawalRow.team_id as string,
      team_name: withdrawalRow.team_name as string,
      withdrawal_status: withdrawalRow.withdrawal_status as string,
      withdrawal_reason: withdrawalRow.withdrawal_reason as string | null,
      withdrawal_requested_at: withdrawalRow.withdrawal_requested_at as string | null,
      tournament_name: withdrawalRow.tournament_name as string,
      tournament_status: withdrawalRow.tournament_status as string,
      contact_email: withdrawalRow.contact_email as string,
      contact_person: withdrawalRow.contact_person as string
    };

    // 処理実行
    const newStatus = action === 'approve' ? 'withdrawal_approved' : 'withdrawal_rejected';
    const adminId = session.user.email; // 管理者IDとしてメールアドレスを使用

    await db.execute(`
      UPDATE t_tournament_teams 
      SET 
        withdrawal_status = ?,
        withdrawal_processed_at = datetime('now', '+9 hours'),
        withdrawal_processed_by = ?,
        withdrawal_admin_comment = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ?
    `, [newStatus, adminId, admin_comment || null, tournamentTeamId]);

    // 承認の場合は自動処理を実行
    if (action === 'approve') {
      await processWithdrawalApproval(tournamentTeamId, withdrawal);
    }

    // メール通知を送信（send_notificationがtrueの場合のみ）
    if (send_notification) {
      try {
        if (action === 'approve') {
          // 承認通知を送信（バックグラウンドで実行）
          sendWithdrawalApprovedNotification(tournamentTeamId, admin_comment, adminId).catch(error => {
            console.error('承認通知送信エラー:', error);
          });
        } else {
          // 却下通知を送信（バックグラウンドで実行）
          sendWithdrawalRejectedNotification(tournamentTeamId, admin_comment, adminId).catch(error => {
            console.error('却下通知送信エラー:', error);
          });
        }
      } catch (notificationError) {
        console.error('通知送信準備エラー:', notificationError);
        // 通知エラーはメイン処理に影響させない
      }
    }

    // 管理者コメントがある場合は別途記録（将来的に管理者コメントテーブルを作成することを想定）
    if (admin_comment) {
      // 現在は単純にログ出力、将来的にはデータベースに保存
    }

    // 処理結果の取得
    const processedResult = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.withdrawal_status,
        tt.withdrawal_processed_at,
        tt.withdrawal_processed_by,
        tt.withdrawal_admin_comment,
        tt.team_name,
        t.tournament_name
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      WHERE tt.tournament_team_id = ?
    `, [tournamentTeamId]);

    const result = processedResult.rows[0];

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      message: action === 'approve' 
        ? '辞退申請を承認しました' 
        : '辞退申請を却下しました',
      data: {
        tournament_team_id: Number(result.tournament_team_id),
        withdrawal_status: String(result.withdrawal_status),
        withdrawal_processed_at: String(result.withdrawal_processed_at),
        withdrawal_processed_by: String(result.withdrawal_processed_by),
        withdrawal_admin_comment: result.withdrawal_admin_comment ? String(result.withdrawal_admin_comment) : null,
        team_name: String(result.team_name),
        tournament_name: String(result.tournament_name),
        action: action,
        admin_comment: admin_comment || null
      }
    });

  } catch (error) {
    console.error('辞退申請処理エラー:', error);
    return NextResponse.json(
      { error: '辞退申請の処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 特定の辞退申請詳細を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentTeamId = parseInt(resolvedParams.id);

    // 辞退申請詳細を取得
    const withdrawalDetail = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name as tournament_team_name,
        tt.team_omission as tournament_team_omission,
        tt.withdrawal_status,
        tt.withdrawal_reason,
        tt.withdrawal_requested_at,
        tt.withdrawal_processed_at,
        tt.withdrawal_processed_by,
        tt.assigned_block,
        tt.block_position,
        tt.created_at as joined_at,
        t.tournament_name,
        t.status as tournament_status,
        t.recruitment_end_date,
        f.format_name,
        v.venue_name,
        mt.team_name as master_team_name,
        mt.contact_person,
        mt.contact_email,
        mt.contact_phone,
        (SELECT COUNT(*) FROM t_tournament_players tp WHERE tp.tournament_id = tt.tournament_id AND tp.team_id = tt.team_id) as player_count
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      INNER JOIN m_teams mt ON tt.team_id = mt.team_id
      WHERE tt.tournament_team_id = ?
    `, [tournamentTeamId]);

    if (withdrawalDetail.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された参加チーム情報が見つかりません' 
      }, { status: 404 });
    }

    const detail = withdrawalDetail.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        tournament_team_id: Number(detail.tournament_team_id),
        tournament_id: Number(detail.tournament_id),
        team_id: String(detail.team_id),
        tournament_team_name: String(detail.tournament_team_name),
        tournament_team_omission: String(detail.tournament_team_omission),
        withdrawal_status: String(detail.withdrawal_status),
        withdrawal_reason: detail.withdrawal_reason ? String(detail.withdrawal_reason) : null,
        withdrawal_requested_at: detail.withdrawal_requested_at ? String(detail.withdrawal_requested_at) : null,
        withdrawal_processed_at: detail.withdrawal_processed_at ? String(detail.withdrawal_processed_at) : null,
        withdrawal_processed_by: detail.withdrawal_processed_by ? String(detail.withdrawal_processed_by) : null,
        assigned_block: detail.assigned_block ? String(detail.assigned_block) : null,
        block_position: detail.block_position ? Number(detail.block_position) : null,
        joined_at: detail.joined_at ? String(detail.joined_at) : null,
        tournament_name: String(detail.tournament_name),
        tournament_status: String(detail.tournament_status),
        recruitment_end_date: detail.recruitment_end_date ? String(detail.recruitment_end_date) : null,
        format_name: detail.format_name ? String(detail.format_name) : null,
        venue_name: detail.venue_name ? String(detail.venue_name) : null,
        master_team_name: String(detail.master_team_name),
        contact_person: String(detail.contact_person),
        contact_email: String(detail.contact_email),
        contact_phone: detail.contact_phone ? String(detail.contact_phone) : null,
        player_count: Number(detail.player_count)
      }
    });

  } catch (error) {
    console.error('辞退申請詳細取得エラー:', error);
    return NextResponse.json(
      { error: '辞退申請詳細の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}