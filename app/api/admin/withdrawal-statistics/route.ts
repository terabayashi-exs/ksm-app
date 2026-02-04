// app/api/admin/withdrawal-statistics/route.ts
// 辞退申請統計レポートAPI

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// interface StatisticsQuery { // 未使用のため削除
//   period?: string; // 'all', '3months', '6months', '1year'
//   tournament_id?: string;
//   status?: string;
// }

interface WithdrawalStatistics {
  overview: {
    total_requests: number;
    pending_requests: number;
    approved_requests: number;
    rejected_requests: number;
    approval_rate: number;
  };
  timeline: {
    date: string;
    requests: number;
    approvals: number;
    rejections: number;
  }[];
  tournaments: {
    tournament_id: number;
    tournament_name: string;
    total_teams: number;
    withdrawal_requests: number;
    withdrawal_rate: number;
    approved: number;
    rejected: number;
    pending: number;
  }[];
  reasons: {
    category: string;
    count: number;
    percentage: number;
  }[];
  processing_times: {
    average_days: number;
    fastest_hours: number;
    slowest_days: number;
    within_24h: number;
    within_72h: number;
    over_week: number;
  };
  blocks_impact: {
    block_name: string;
    affected_teams: number;
    affected_matches: number;
  }[];
}

// 統計レポートの取得
export async function GET(request: NextRequest) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all';
    const tournamentId = searchParams.get('tournament_id');
    const status = searchParams.get('status');

    // 期間フィルター作成
    let dateFilter = '';
    const params: (string | number)[] = [];
    
    if (period !== 'all') {
      let months = 12;
      switch (period) {
        case '3months': months = 3; break;
        case '6months': months = 6; break;
        case '1year': months = 12; break;
      }
      dateFilter = "AND tt.withdrawal_requested_at >= datetime('now', '-" + months + " months', '+9 hours')";
    }

    // 基本統計の取得
    const overviewQuery = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN tt.withdrawal_status = 'withdrawal_requested' THEN 1 ELSE 0 END) as pending_requests,
        SUM(CASE WHEN tt.withdrawal_status = 'withdrawal_approved' THEN 1 ELSE 0 END) as approved_requests,
        SUM(CASE WHEN tt.withdrawal_status = 'withdrawal_rejected' THEN 1 ELSE 0 END) as rejected_requests
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status != 'active'
      ${dateFilter}
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
      ${status ? 'AND tt.withdrawal_status = ?' : ''}
    `;
    
    if (tournamentId) params.push(parseInt(tournamentId));
    if (status) params.push(status);
    
    const overview = await db.execute(overviewQuery, params);
    const overviewData = overview.rows[0];

    // タイムライン統計（過去30日間）
    const timelineQuery = `
      SELECT 
        DATE(tt.withdrawal_requested_at) as date,
        COUNT(*) as requests,
        SUM(CASE WHEN tt.withdrawal_status = 'withdrawal_approved' THEN 1 ELSE 0 END) as approvals,
        SUM(CASE WHEN tt.withdrawal_status = 'withdrawal_rejected' THEN 1 ELSE 0 END) as rejections
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status != 'active'
      AND tt.withdrawal_requested_at >= datetime('now', '-30 days', '+9 hours')
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
      GROUP BY DATE(tt.withdrawal_requested_at)
      ORDER BY DATE(tt.withdrawal_requested_at)
    `;
    
    const timelineParams = tournamentId ? [parseInt(tournamentId)] : [];
    const timeline = await db.execute(timelineQuery, timelineParams);

    // 大会別統計
    const tournamentStatsQuery = `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        COUNT(DISTINCT tt_all.tournament_team_id) as total_teams,
        COUNT(DISTINCT tt_withdrawn.tournament_team_id) as withdrawal_requests,
        SUM(CASE WHEN tt_withdrawn.withdrawal_status = 'withdrawal_approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN tt_withdrawn.withdrawal_status = 'withdrawal_rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN tt_withdrawn.withdrawal_status = 'withdrawal_requested' THEN 1 ELSE 0 END) as pending
      FROM t_tournaments t
      LEFT JOIN t_tournament_teams tt_all ON t.tournament_id = tt_all.tournament_id
      LEFT JOIN t_tournament_teams tt_withdrawn ON t.tournament_id = tt_withdrawn.tournament_id 
        AND tt_withdrawn.withdrawal_status != 'active'
        ${dateFilter.replace('tt.', 'tt_withdrawn.')}
      WHERE t.created_at >= datetime('now', '-1 year', '+9 hours')
      ${tournamentId ? 'AND t.tournament_id = ?' : ''}
      GROUP BY t.tournament_id, t.tournament_name
      HAVING withdrawal_requests > 0
      ORDER BY withdrawal_requests DESC
    `;

    const tournamentStats = await db.execute(tournamentStatsQuery, tournamentId ? [parseInt(tournamentId)] : []);

    // 辞退理由の分析
    const reasonsQuery = `
      SELECT 
        CASE 
          WHEN tt.withdrawal_reason LIKE '%怪我%' OR tt.withdrawal_reason LIKE '%ケガ%' THEN '怪我・体調不良'
          WHEN tt.withdrawal_reason LIKE '%仕事%' OR tt.withdrawal_reason LIKE '%業務%' THEN '仕事・業務都合'
          WHEN tt.withdrawal_reason LIKE '%家族%' OR tt.withdrawal_reason LIKE '%家庭%' THEN '家庭・家族の事情'
          WHEN tt.withdrawal_reason LIKE '%コロナ%' OR tt.withdrawal_reason LIKE '%感染%' THEN 'コロナ・感染症'
          WHEN tt.withdrawal_reason LIKE '%天候%' OR tt.withdrawal_reason LIKE '%天気%' THEN '天候理由'
          WHEN tt.withdrawal_reason LIKE '%交通%' OR tt.withdrawal_reason LIKE '%移動%' THEN '交通・移動問題'
          WHEN tt.withdrawal_reason LIKE '%人数%' OR tt.withdrawal_reason LIKE '%メンバー%' THEN 'メンバー不足'
          ELSE 'その他'
        END as category,
        COUNT(*) as count
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status != 'active'
      AND tt.withdrawal_reason IS NOT NULL
      ${dateFilter}
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
      GROUP BY category
      ORDER BY count DESC
    `;

    const reasons = await db.execute(reasonsQuery, tournamentId ? [parseInt(tournamentId)] : []);
    const totalReasons = reasons.rows.reduce((sum, row) => sum + Number(row.count), 0);

    // 処理時間統計
    const processingTimeQuery = `
      SELECT 
        AVG(JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) as avg_days,
        MIN(JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) * 24 as fastest_hours,
        MAX(JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) as slowest_days,
        SUM(CASE WHEN (JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) <= 1 THEN 1 ELSE 0 END) as within_24h,
        SUM(CASE WHEN (JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) <= 3 THEN 1 ELSE 0 END) as within_72h,
        SUM(CASE WHEN (JULIANDAY(tt.withdrawal_processed_at) - JULIANDAY(tt.withdrawal_requested_at)) > 7 THEN 1 ELSE 0 END) as over_week
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status IN ('withdrawal_approved', 'withdrawal_rejected')
      AND tt.withdrawal_requested_at IS NOT NULL
      AND tt.withdrawal_processed_at IS NOT NULL
      ${dateFilter}
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
    `;

    const processingTime = await db.execute(processingTimeQuery, tournamentId ? [parseInt(tournamentId)] : []);

    // ブロック別影響統計
    const blocksQuery = `
      SELECT
        tt.assigned_block as block_name,
        COUNT(*) as affected_teams,
        (SELECT COUNT(*) FROM t_matches_live ml WHERE ml.tournament_id = tt.tournament_id AND (ml.team1_tournament_team_id = tt.tournament_team_id OR ml.team2_tournament_team_id = tt.tournament_team_id)) as affected_matches
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status IN ('withdrawal_approved')
      AND tt.assigned_block IS NOT NULL
      ${dateFilter}
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
      GROUP BY tt.assigned_block
      ORDER BY affected_teams DESC
    `;

    const blocks = await db.execute(blocksQuery, tournamentId ? [parseInt(tournamentId)] : []);

    // データ整形
    const total = Number(overviewData?.total_requests || 0);
    const approved = Number(overviewData?.approved_requests || 0);
    const approvalRate = total > 0 ? (approved / total) * 100 : 0;

    const statistics: WithdrawalStatistics = {
      overview: {
        total_requests: total,
        pending_requests: Number(overviewData?.pending_requests || 0),
        approved_requests: approved,
        rejected_requests: Number(overviewData?.rejected_requests || 0),
        approval_rate: Math.round(approvalRate * 100) / 100
      },
      timeline: timeline.rows.map(row => ({
        date: String(row.date),
        requests: Number(row.requests),
        approvals: Number(row.approvals),
        rejections: Number(row.rejections)
      })),
      tournaments: tournamentStats.rows.map(row => {
        const totalTeams = Number(row.total_teams || 0);
        const withdrawalRequests = Number(row.withdrawal_requests || 0);
        return {
          tournament_id: Number(row.tournament_id),
          tournament_name: String(row.tournament_name),
          total_teams: totalTeams,
          withdrawal_requests: withdrawalRequests,
          withdrawal_rate: totalTeams > 0 ? Math.round((withdrawalRequests / totalTeams) * 10000) / 100 : 0,
          approved: Number(row.approved || 0),
          rejected: Number(row.rejected || 0),
          pending: Number(row.pending || 0)
        };
      }),
      reasons: reasons.rows.map(row => ({
        category: String(row.category),
        count: Number(row.count),
        percentage: totalReasons > 0 ? Math.round((Number(row.count) / totalReasons) * 10000) / 100 : 0
      })),
      processing_times: {
        average_days: Math.round((Number(processingTime.rows[0]?.avg_days || 0)) * 100) / 100,
        fastest_hours: Math.round((Number(processingTime.rows[0]?.fastest_hours || 0)) * 100) / 100,
        slowest_days: Math.round((Number(processingTime.rows[0]?.slowest_days || 0)) * 100) / 100,
        within_24h: Number(processingTime.rows[0]?.within_24h || 0),
        within_72h: Number(processingTime.rows[0]?.within_72h || 0),
        over_week: Number(processingTime.rows[0]?.over_week || 0)
      },
      blocks_impact: blocks.rows.map(row => ({
        block_name: String(row.block_name),
        affected_teams: Number(row.affected_teams),
        affected_matches: Number(row.affected_matches)
      }))
    };

    return NextResponse.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('統計レポート取得エラー:', error);
    return NextResponse.json(
      { error: '統計レポートの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}