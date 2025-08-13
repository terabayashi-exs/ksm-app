// app/api/admin/withdrawal-requests/[id]/impact/route.ts
// 辞退承認時の影響分析API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { analyzeWithdrawalImpact } from '@/lib/withdrawal-processor';

// 辞退承認時の影響分析
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const tournamentTeamId = parseInt(params.id);

    // 対象の辞退申請を確認
    const withdrawalCheck = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name,
        tt.withdrawal_status,
        tt.assigned_block,
        tt.block_position,
        t.tournament_name,
        t.status as tournament_status
      FROM t_tournament_teams tt
      INNER JOIN t_tournaments t ON tt.tournament_id = t.tournament_id
      WHERE tt.tournament_team_id = ?
    `, [tournamentTeamId]);

    if (withdrawalCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: '指定された参加チーム情報が見つかりません' 
      }, { status: 404 });
    }

    const withdrawal = withdrawalCheck.rows[0];

    // 申請状態チェック
    if (withdrawal.withdrawal_status !== 'withdrawal_requested') {
      return NextResponse.json({ 
        error: '申請中の辞退申請のみ分析できます' 
      }, { status: 400 });
    }

    // 影響分析を実行
    const impact = await analyzeWithdrawalImpact(
      Number(withdrawal.tournament_id),
      String(withdrawal.team_id)
    );

    // 関連する試合の詳細情報を取得
    const relatedMatches = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.match_status,
        ml.tournament_date,
        ml.start_time,
        mf.match_id as is_confirmed
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE ml.tournament_id = ? 
        AND (ml.team1_id = ? OR ml.team2_id = ?)
      ORDER BY ml.tournament_date, ml.start_time
    `, [withdrawal.tournament_id, withdrawal.team_id, withdrawal.team_id]);

    // 同じブロックの他のチーム情報を取得
    const blockTeams = withdrawal.assigned_block ? await db.execute(`
      SELECT 
        tt.team_name,
        tt.block_position,
        tt.withdrawal_status
      FROM t_tournament_teams tt
      WHERE tt.tournament_id = ? 
        AND tt.assigned_block = ?
        AND tt.team_id != ?
      ORDER BY tt.block_position
    `, [withdrawal.tournament_id, withdrawal.assigned_block, withdrawal.team_id]) : { rows: [] };

    // 処理予定のアクション一覧を生成
    const plannedActions = [];

    // 試合処理
    for (const match of relatedMatches.rows) {
      if (match.is_confirmed) {
        plannedActions.push({
          type: 'warning',
          action: '手動確認が必要',
          target: `試合 ${match.match_code}`,
          description: '既に確定済みの試合のため、手動での対応が必要です'
        });
      } else if (match.match_status === 'scheduled') {
        plannedActions.push({
          type: 'auto',
          action: '不戦勝処理',
          target: `試合 ${match.match_code}`,
          description: '対戦相手を不戦勝とし、スコアを3-0で自動設定'
        });
      } else if (match.match_status === 'ongoing') {
        plannedActions.push({
          type: 'warning',
          action: '試合中止',
          target: `試合 ${match.match_code}`,
          description: '進行中の試合を中止し、手動確認を要求'
        });
      } else if (match.match_status === 'completed') {
        plannedActions.push({
          type: 'info',
          action: '結果維持',
          target: `試合 ${match.match_code}`,
          description: '完了済みの結果を維持（確定処理は手動）'
        });
      }
    }

    // ブロック調整
    if (impact.blockAdjustment) {
      const affectedPositions = blockTeams.rows
        .filter(team => Number(team.block_position) > Number(withdrawal.block_position))
        .length;
      
      if (affectedPositions > 0) {
        plannedActions.push({
          type: 'auto',
          action: 'ブロック位置調整',
          target: `${withdrawal.assigned_block}ブロック`,
          description: `${affectedPositions}チームの位置を前に詰める`
        });
      }
    }

    // 順位表更新
    if (impact.rankingUpdate) {
      plannedActions.push({
        type: 'auto',
        action: '順位表再計算',
        target: '大会全体',
        description: '全ブロックの順位表を再計算'
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        withdrawal_info: {
          tournament_team_id: Number(withdrawal.tournament_team_id),
          team_name: String(withdrawal.team_name),
          tournament_name: String(withdrawal.tournament_name),
          assigned_block: withdrawal.assigned_block ? String(withdrawal.assigned_block) : null,
          block_position: withdrawal.block_position ? Number(withdrawal.block_position) : null
        },
        impact_analysis: impact,
        related_matches: relatedMatches.rows.map(match => ({
          match_id: Number(match.match_id),
          match_code: String(match.match_code),
          team1_display_name: String(match.team1_display_name),
          team2_display_name: String(match.team2_display_name),
          match_status: String(match.match_status),
          tournament_date: match.tournament_date ? String(match.tournament_date) : null,
          start_time: match.start_time ? String(match.start_time) : null,
          is_confirmed: Boolean(match.is_confirmed)
        })),
        block_teams: blockTeams.rows.map(team => ({
          team_name: String(team.team_name),
          block_position: Number(team.block_position),
          withdrawal_status: String(team.withdrawal_status)
        })),
        planned_actions: plannedActions
      }
    });

  } catch (error) {
    console.error('辞退影響分析エラー:', error);
    return NextResponse.json(
      { error: '辞退影響分析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}