// app/api/admin/withdrawal-requests/bulk-process/route.ts
// 辞退申請一括処理API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { processWithdrawalApproval } from '@/lib/withdrawal-processor';
import { sendWithdrawalApprovedNotification, sendWithdrawalRejectedNotification } from '@/lib/withdrawal-notifications';

interface BulkProcessRequest {
  action: 'approve' | 'reject';
  tournament_team_ids: number[];
  admin_comment?: string;
  individual_comments?: Record<number, string>; // 個別コメント
}

interface ProcessResult {
  tournament_team_id: number;
  success: boolean;
  error?: string;
  team_name?: string;
}

// 辞退申請一括処理
export async function POST(request: NextRequest) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { action, tournament_team_ids, admin_comment, individual_comments }: BulkProcessRequest = await request.json();

    // 入力値検証
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ 
        error: 'actionは"approve"または"reject"である必要があります' 
      }, { status: 400 });
    }

    if (!Array.isArray(tournament_team_ids) || tournament_team_ids.length === 0) {
      return NextResponse.json({ 
        error: '処理対象のチームが指定されていません' 
      }, { status: 400 });
    }

    if (tournament_team_ids.length > 50) {
      return NextResponse.json({ 
        error: '一度に処理できるのは50件までです' 
      }, { status: 400 });
    }

    // 各辞退申請の存在確認と状態チェック
    const withdrawalCheck = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.team_id,
        tt.team_name,
        tt.withdrawal_status,
        t.tournament_name,
        mt.contact_email,
        mt.contact_person
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      INNER JOIN m_teams mt ON tt.team_id = mt.team_id
      WHERE tt.tournament_team_id IN (${tournament_team_ids.map(() => '?').join(',')})
    `, tournament_team_ids);

    // 存在しないIDやすでに処理済みのIDをチェック
    const existingIds = withdrawalCheck.rows.map(row => Number(row.tournament_team_id));
    const missingIds = tournament_team_ids.filter(id => !existingIds.includes(id));
    const invalidStatus = withdrawalCheck.rows.filter(row => row.withdrawal_status !== 'withdrawal_requested');

    if (missingIds.length > 0) {
      return NextResponse.json({ 
        error: `以下のIDが見つかりません: ${missingIds.join(', ')}` 
      }, { status: 404 });
    }

    if (invalidStatus.length > 0) {
      const invalidTeams = invalidStatus.map(row => `${row.team_name} (ID: ${row.tournament_team_id})`);
      return NextResponse.json({ 
        error: `以下のチームは既に処理済みか申請中ではありません: ${invalidTeams.join(', ')}` 
      }, { status: 400 });
    }

    const adminId = session.user.email;
    const newStatus = action === 'approve' ? 'withdrawal_approved' : 'withdrawal_rejected';
    const results: ProcessResult[] = [];
    const successfulProcesses: typeof withdrawalCheck.rows = [];

    console.log(`🔄 一括処理開始: ${action} (${tournament_team_ids.length}件)`);

    // 各申請を順次処理
    for (const row of withdrawalCheck.rows) {
      const tournamentTeamId = Number(row.tournament_team_id);
      const currentComment = individual_comments?.[tournamentTeamId] || admin_comment || null;

      try {
        // データベース更新
        await db.execute(`
          UPDATE t_tournament_teams 
          SET 
            withdrawal_status = ?,
            withdrawal_processed_at = datetime('now', '+9 hours'),
            withdrawal_processed_by = ?,
            withdrawal_admin_comment = ?,
            updated_at = datetime('now', '+9 hours')
          WHERE tournament_team_id = ?
        `, [newStatus, adminId, currentComment, tournamentTeamId]);

        // 承認の場合は自動処理を実行
        if (action === 'approve') {
          await processWithdrawalApproval(tournamentTeamId, {
            tournament_team_id: tournamentTeamId,
            tournament_id: Number(row.tournament_id || 0),
            team_id: String(row.team_id),
            team_name: String(row.team_name),
            withdrawal_status: String(row.withdrawal_status),
            withdrawal_reason: null,
            withdrawal_requested_at: null,
            tournament_name: String(row.tournament_name),
            tournament_status: 'ongoing',
            contact_email: String(row.contact_email),
            contact_person: String(row.contact_person)
          });
        }

        results.push({
          tournament_team_id: tournamentTeamId,
          success: true,
          team_name: String(row.team_name)
        });

        successfulProcesses.push(row);

        console.log(`✅ 処理成功: ${row.team_name} (ID: ${tournamentTeamId})`);

      } catch (error) {
        console.error(`❌ 処理失敗: ${row.team_name} (ID: ${tournamentTeamId})`, error);
        
        results.push({
          tournament_team_id: tournamentTeamId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          team_name: String(row.team_name)
        });
      }
    }

    // 成功した処理に対してメール通知を送信（バックグラウンド処理）
    if (successfulProcesses.length > 0) {
      console.log(`📧 メール通知送信開始: ${successfulProcesses.length}件`);
      
      const notificationPromises = successfulProcesses.map(async (row) => {
        const tournamentTeamId = Number(row.tournament_team_id);
        const currentComment = individual_comments?.[tournamentTeamId] || admin_comment;
        
        try {
          if (action === 'approve') {
            await sendWithdrawalApprovedNotification(tournamentTeamId, currentComment, adminId);
          } else {
            await sendWithdrawalRejectedNotification(tournamentTeamId, currentComment, adminId);
          }
          console.log(`📧 通知送信成功: ${row.team_name}`);
        } catch (error) {
          console.error(`📧 通知送信失敗: ${row.team_name}`, error);
        }
      });

      // 通知は非同期で実行（レスポンスには影響させない）
      Promise.all(notificationPromises).then(() => {
        console.log(`📧 一括通知完了: ${successfulProcesses.length}件`);
      }).catch(error => {
        console.error('一括通知エラー:', error);
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `一括処理完了: 成功 ${successCount}件, 失敗 ${failureCount}件`,
      data: {
        action,
        total_processed: results.length,
        success_count: successCount,
        failure_count: failureCount,
        results,
        admin_comment: admin_comment,
        processed_by: adminId,
        processed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('一括処理エラー:', error);
    return NextResponse.json(
      { error: '一括処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}

// 一括処理の影響分析
export async function GET(request: NextRequest) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    const action = searchParams.get('action');

    if (!idsParam || !action) {
      return NextResponse.json({ 
        error: 'IDsとactionパラメータが必要です' 
      }, { status: 400 });
    }

    const tournament_team_ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

    if (tournament_team_ids.length === 0) {
      return NextResponse.json({ 
        error: '有効なIDが指定されていません' 
      }, { status: 400 });
    }

    // 対象チームの情報と影響範囲を取得
    const teamsInfo = await db.execute(`
      SELECT
        tt.tournament_team_id,
        tt.team_name,
        tt.tournament_id,
        tt.team_id,
        tt.withdrawal_status,
        tt.assigned_block,
        t.tournament_name,
        (SELECT COUNT(*) FROM t_matches_live ml WHERE ml.tournament_id = tt.tournament_id AND (ml.team1_tournament_team_id = tt.tournament_team_id OR ml.team2_tournament_team_id = tt.tournament_team_id)) as affected_matches
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      WHERE tt.tournament_team_id IN (${tournament_team_ids.map(() => '?').join(',')})
    `, tournament_team_ids);

    const totalAffectedMatches = teamsInfo.rows.reduce((sum, row) => sum + Number(row.affected_matches || 0), 0);
    const tournamentIds = [...new Set(teamsInfo.rows.map(row => Number(row.tournament_id)))];
    const blocksAffected = [...new Set(teamsInfo.rows.map(row => row.assigned_block).filter(Boolean))];

    const analysisResult = {
      total_teams: teamsInfo.rows.length,
      affected_tournaments: tournamentIds.length,
      affected_matches: totalAffectedMatches,
      affected_blocks: blocksAffected.length,
      blocks_list: blocksAffected,
      teams_info: teamsInfo.rows.map(row => ({
        tournament_team_id: Number(row.tournament_team_id),
        team_name: String(row.team_name),
        tournament_name: String(row.tournament_name),
        withdrawal_status: String(row.withdrawal_status),
        assigned_block: row.assigned_block ? String(row.assigned_block) : null,
        affected_matches: Number(row.affected_matches || 0)
      })),
      estimated_processing_time: `約 ${Math.ceil(teamsInfo.rows.length * 2)}秒`,
      warnings: [] as string[]
    };

    // 警告メッセージの生成
    if (totalAffectedMatches > 20) {
      analysisResult.warnings.push(`${totalAffectedMatches}試合に影響します。処理に時間がかかる場合があります。`);
    }

    if (action === 'approve' && blocksAffected.length > 3) {
      analysisResult.warnings.push(`${blocksAffected.length}個のブロックに影響し、順位表の大幅な変更が発生します。`);
    }

    if (teamsInfo.rows.some(row => row.withdrawal_status !== 'withdrawal_requested')) {
      analysisResult.warnings.push('申請中以外のチームが含まれています。これらはスキップされます。');
    }

    return NextResponse.json({
      success: true,
      data: analysisResult
    });

  } catch (error) {
    console.error('一括処理影響分析エラー:', error);
    return NextResponse.json(
      { error: '影響分析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}