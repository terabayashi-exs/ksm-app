// app/api/tournaments/[id]/withdrawal/route.ts
// 大会エントリー辞退申請API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWithdrawalReceivedNotification } from '@/lib/withdrawal-notifications';

// 辞退申請の送信
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    const { tournament_team_id, withdrawal_reason } = await request.json();

    // 入力値検証
    if (!tournament_team_id || !withdrawal_reason?.trim()) {
      return NextResponse.json({ 
        error: '大会参加IDと辞退理由は必須です' 
      }, { status: 400 });
    }

    if (withdrawal_reason.trim().length > 500) {
      return NextResponse.json({ 
        error: '辞退理由は500文字以内で入力してください' 
      }, { status: 400 });
    }

    // 権限チェック: 申請者がそのチームの代表者かどうか確認
    const teamCheck = await db.execute(`
      SELECT tt.team_id, tt.withdrawal_status, t.contact_email
      FROM t_tournament_teams tt
      INNER JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_team_id = ? AND tt.tournament_id = ?
    `, [tournament_team_id, tournamentId]);

    if (teamCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された大会参加情報が見つかりません' 
      }, { status: 404 });
    }

    const teamData = teamCheck.rows[0];
    
    // チーム代表者のメールアドレスと一致するかチェック
    if (teamData.contact_email !== session.user.email) {
      return NextResponse.json({ 
        error: 'このチームの辞退申請権限がありません' 
      }, { status: 403 });
    }

    // 既に辞退申請済みか確認
    if (teamData.withdrawal_status !== 'active') {
      return NextResponse.json({ 
        error: '既に辞退申請が行われているか、処理済みです' 
      }, { status: 400 });
    }

    // 大会の募集期間や開催状況をチェック
    const tournamentCheck = await db.execute(`
      SELECT status, recruitment_end_date 
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された大会が見つかりません' 
      }, { status: 404 });
    }

    const tournament = tournamentCheck.rows[0];
    
    // 大会が既に完了している場合は辞退不可
    if (tournament.status === 'completed') {
      return NextResponse.json({ 
        error: '完了済みの大会からは辞退できません' 
      }, { status: 400 });
    }

    // 辞退申請の保存
    const now = new Date().toISOString();
    
    await db.execute(`
      UPDATE t_tournament_teams 
      SET 
        withdrawal_status = 'withdrawal_requested',
        withdrawal_reason = ?,
        withdrawal_requested_at = datetime('now', '+9 hours'),
        updated_at = datetime('now', '+9 hours')
      WHERE tournament_team_id = ? AND tournament_id = ?
    `, [withdrawal_reason.trim(), tournament_team_id, tournamentId]);

    // 受付確認メール通知を送信
    try {
      await sendWithdrawalReceivedNotification(tournament_team_id);
      console.log(`✅ 辞退受付メール送信完了: ${tournament_team_id}`);
    } catch (notificationError) {
      console.error('❌ 受付確認通知送信エラー:', notificationError);
      // 通知エラーはメイン処理に影響させない（辞退申請自体は成功として扱う）
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      message: '辞退申請を受け付けました。管理者の承認をお待ちください。確認メールをお送りしました。',
      data: {
        tournament_team_id,
        withdrawal_status: 'withdrawal_requested',
        withdrawal_requested_at: now
      }
    });

  } catch (error) {
    console.error('辞退申請エラー:', error);
    return NextResponse.json(
      { error: '辞退申請の処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 辞退申請状況の取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    // URLパラメータからtournament_team_idを取得
    const { searchParams } = new URL(request.url);
    const tournamentTeamIdParam = searchParams.get('team');

    // ユーザーのチームIDを取得
    const teamCheck = await db.execute(`
      SELECT team_id FROM m_teams WHERE contact_email = ?
    `, [session.user.email]);

    if (teamCheck.rows.length === 0) {
      return NextResponse.json({
        error: 'チーム情報が見つかりません'
      }, { status: 404 });
    }

    const teamId = teamCheck.rows[0].team_id;

    // 大会参加状況と辞退状況を取得
    let withdrawalInfo;

    if (tournamentTeamIdParam) {
      // tournament_team_idが指定されている場合、それを優先
      const tournamentTeamId = parseInt(tournamentTeamIdParam);

      withdrawalInfo = await db.execute(`
        SELECT
          tt.tournament_team_id,
          tt.team_name,
          tt.team_omission,
          tt.withdrawal_status,
          tt.withdrawal_reason,
          tt.withdrawal_requested_at,
          tt.withdrawal_processed_at,
          tt.withdrawal_processed_by,
          t.tournament_name,
          t.status as tournament_status
        FROM t_tournament_teams tt
        INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
        WHERE tt.tournament_id = ? AND tt.tournament_team_id = ? AND tt.team_id = ?
      `, [tournamentId, tournamentTeamId, teamId]);
    } else {
      // tournament_team_idがない場合、team_idで最初の1件を取得（後方互換性）
      withdrawalInfo = await db.execute(`
        SELECT
          tt.tournament_team_id,
          tt.team_name,
          tt.team_omission,
          tt.withdrawal_status,
          tt.withdrawal_reason,
          tt.withdrawal_requested_at,
          tt.withdrawal_processed_at,
          tt.withdrawal_processed_by,
          t.tournament_name,
          t.status as tournament_status
        FROM t_tournament_teams tt
        INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
        WHERE tt.tournament_id = ? AND tt.team_id = ?
        LIMIT 1
      `, [tournamentId, teamId]);
    }

    if (withdrawalInfo.rows.length === 0) {
      return NextResponse.json({
        error: 'この大会への参加情報が見つかりません'
      }, { status: 404 });
    }

    const info = withdrawalInfo.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        tournament_team_id: info.tournament_team_id,
        team_name: info.team_name,
        team_omission: info.team_omission,
        tournament_name: info.tournament_name,
        tournament_status: info.tournament_status,
        withdrawal_status: info.withdrawal_status,
        withdrawal_reason: info.withdrawal_reason,
        withdrawal_requested_at: info.withdrawal_requested_at,
        withdrawal_processed_at: info.withdrawal_processed_at,
        withdrawal_processed_by: info.withdrawal_processed_by,
        can_withdraw: info.withdrawal_status === 'active' && info.tournament_status !== 'completed'
      }
    });

  } catch (error) {
    console.error('辞退状況取得エラー:', error);
    return NextResponse.json(
      { error: '辞退状況の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}