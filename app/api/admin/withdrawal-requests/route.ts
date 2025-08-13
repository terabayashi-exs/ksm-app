// app/api/admin/withdrawal-requests/route.ts
// 管理者向け辞退申請管理API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// 辞退申請一覧の取得
export async function GET(request: NextRequest) {
  try {
    // 管理者権限チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all'; // all, pending, approved, rejected
    const tournamentId = searchParams.get('tournament_id');

    // ベースクエリ
    const whereConditions: string[] = [];
    const queryParams: (string | number)[] = [];

    // ステータスフィルター
    if (status !== 'all') {
      whereConditions.push('tt.withdrawal_status = ?');
      queryParams.push(status === 'pending' ? 'withdrawal_requested' : `withdrawal_${status}`);
    } else {
      // 辞退関連の申請のみ取得（activeは除外）
      whereConditions.push('tt.withdrawal_status != ?');
      queryParams.push('active');
    }

    // 大会IDフィルター
    if (tournamentId) {
      whereConditions.push('t.tournament_id = ?');
      queryParams.push(parseInt(tournamentId));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 辞退申請一覧を取得
    const withdrawalRequests = await db.execute(`
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
        tt.withdrawal_admin_comment,
        tt.assigned_block,
        tt.block_position,
        t.tournament_name,
        t.status as tournament_status,
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
      ${whereClause}
      ORDER BY 
        CASE tt.withdrawal_status 
          WHEN 'withdrawal_requested' THEN 1
          WHEN 'withdrawal_rejected' THEN 2
          WHEN 'withdrawal_approved' THEN 3
          ELSE 4
        END,
        tt.withdrawal_requested_at DESC
    `, queryParams);

    // データ整形
    const formattedRequests = withdrawalRequests.rows.map(row => ({
      tournament_team_id: Number(row.tournament_team_id),
      tournament_id: Number(row.tournament_id),
      team_id: String(row.team_id),
      tournament_team_name: String(row.tournament_team_name),
      tournament_team_omission: String(row.tournament_team_omission),
      withdrawal_status: String(row.withdrawal_status),
      withdrawal_reason: row.withdrawal_reason ? String(row.withdrawal_reason) : null,
      withdrawal_requested_at: row.withdrawal_requested_at ? String(row.withdrawal_requested_at) : null,
      withdrawal_processed_at: row.withdrawal_processed_at ? String(row.withdrawal_processed_at) : null,
      withdrawal_processed_by: row.withdrawal_processed_by ? String(row.withdrawal_processed_by) : null,
      withdrawal_admin_comment: row.withdrawal_admin_comment ? String(row.withdrawal_admin_comment) : null,
      assigned_block: row.assigned_block ? String(row.assigned_block) : null,
      block_position: row.block_position ? Number(row.block_position) : null,
      tournament_name: String(row.tournament_name),
      tournament_status: String(row.tournament_status),
      format_name: row.format_name ? String(row.format_name) : null,
      venue_name: row.venue_name ? String(row.venue_name) : null,
      master_team_name: String(row.master_team_name),
      contact_person: String(row.contact_person),
      contact_email: String(row.contact_email),
      contact_phone: row.contact_phone ? String(row.contact_phone) : null,
      player_count: Number(row.player_count)
    }));

    // 統計情報も合わせて返す
    const stats = await db.execute(`
      SELECT 
        tt.withdrawal_status,
        COUNT(*) as count
      FROM t_tournament_teams tt
      WHERE tt.withdrawal_status != 'active'
      ${tournamentId ? 'AND tt.tournament_id = ?' : ''}
      GROUP BY tt.withdrawal_status
    `, tournamentId ? [parseInt(tournamentId)] : []);

    const statistics = {
      pending: 0,
      approved: 0,
      rejected: 0
    };

    stats.rows.forEach(row => {
      const status = String(row.withdrawal_status);
      const count = Number(row.count);
      
      if (status === 'withdrawal_requested') {
        statistics.pending = count;
      } else if (status === 'withdrawal_approved') {
        statistics.approved = count;
      } else if (status === 'withdrawal_rejected') {
        statistics.rejected = count;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        requests: formattedRequests,
        statistics,
        total: formattedRequests.length
      }
    });

  } catch (error) {
    console.error('辞退申請一覧取得エラー:', error);
    return NextResponse.json(
      { error: '辞退申請一覧の取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
}