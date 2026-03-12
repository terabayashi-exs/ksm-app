import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: コート別設定と試合一覧を取得
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: '無効な部門ID' }, { status: 400 });
    }

    // 部門情報を取得（会場リスト含む）
    const tournamentResult = await db.execute(`
      SELECT tournament_id, tournament_name, venue_id, court_count
      FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: '部門が見つかりません' }, { status: 404 });
    }

    const tournament = tournamentResult.rows[0];

    // 会場リストを取得（部門に紐づく会場）
    let venues: Array<Record<string, unknown>> = [];
    if (tournament.venue_id) {
      const venueResult = await db.execute(`
        SELECT v.venue_id, v.venue_name, v.address, v.available_courts
        FROM m_venues v
        WHERE v.venue_id IN (
          SELECT CAST(value AS INTEGER) FROM json_each(?)
        )
      `, [String(tournament.venue_id)]);
      venues = venueResult.rows.map(r => ({
        venue_id: Number(r.venue_id),
        venue_name: String(r.venue_name),
        address: r.address ? String(r.address) : null,
        available_courts: Number(r.available_courts),
      }));
    }

    // コート設定を試合データから取得
    const courtsResult = await db.execute(`
      SELECT DISTINCT ml.court_number, ml.court_name, ml.venue_id
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.court_number IS NOT NULL
      ORDER BY ml.court_number
    `, [tournamentId]);

    const courtSettings = courtsResult.rows.map((r, i) => ({
      tournament_court_id: i + 1,
      court_number: Number(r.court_number),
      court_name: r.court_name ? String(r.court_name) : `コート${r.court_number}`,
      venue_id: r.venue_id ? Number(r.venue_id) : null,
      display_order: Number(r.court_number),
    }));

    // コート番号別に試合を取得（チーム略称をJOINで取得）
    const matchesResult = await db.execute(`
      SELECT
        ml.match_id, ml.match_code, ml.court_number, ml.start_time, ml.court_name, ml.venue_id, ml.venue_name,
        ml.team1_display_name, ml.team2_display_name, ml.match_status, ml.tournament_date,
        ml.team1_tournament_team_id, ml.team2_tournament_team_id,
        tt1.team_omission AS team1_omission,
        tt2.team_omission AS team2_omission
      FROM t_matches_live ml
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE ml.match_block_id IN (
        SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
      )
      ORDER BY ml.tournament_date, ml.court_number, ml.start_time
    `, [tournamentId]);

    const matches = matchesResult.rows.map(r => ({
      match_id: Number(r.match_id),
      match_code: String(r.match_code),
      court_number: r.court_number ? Number(r.court_number) : null,
      start_time: r.start_time ? String(r.start_time) : null,
      court_name: r.court_name ? String(r.court_name) : null,
      venue_id: r.venue_id ? Number(r.venue_id) : null,
      venue_name: r.venue_name ? String(r.venue_name) : null,
      team1_display_name: r.team1_omission ? String(r.team1_omission) : String(r.team1_display_name),
      team2_display_name: r.team2_omission ? String(r.team2_omission) : String(r.team2_display_name),
      match_status: String(r.match_status),
      tournament_date: String(r.tournament_date),
    }));

    return NextResponse.json({
      success: true,
      data: {
        tournament: {
          tournament_id: Number(tournament.tournament_id),
          tournament_name: String(tournament.tournament_name),
          venue_id: tournament.venue_id ? String(tournament.venue_id) : null,
          court_count: Number(tournament.court_count),
        },
        venues,
        courtSettings,
        matches,
      }
    });
  } catch (error) {
    console.error('会場・コート設定取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '取得に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// PUT: コート別設定を保存
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '権限がありません' }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: '無効な部門ID' }, { status: 400 });
    }

    const body = await request.json();
    const { dateCourtSettings, courtSettings, matchOverrides } = body;

    // 日付×コートごとの設定（新方式）
    if (dateCourtSettings && Array.isArray(dateCourtSettings)) {
      for (const dcs of dateCourtSettings) {
        // venue_nameを取得
        let venueName: string | null = null;
        if (dcs.venue_id) {
          const venueResult = await db.execute(`SELECT venue_name FROM m_venues WHERE venue_id = ?`, [dcs.venue_id]);
          if (venueResult.rows.length > 0) {
            venueName = String(venueResult.rows[0].venue_name);
          }
        }

        // 該当日付×コート番号の試合を一括更新
        await db.execute(`
          UPDATE t_matches_live
          SET court_name = ?, venue_id = ?, venue_name = ?
          WHERE court_number = ? AND tournament_date = ? AND match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [dcs.court_name, dcs.venue_id || null, venueName, dcs.court_number, dcs.date, tournamentId]);

      }
    }

    // 旧方式（courtSettings）との後方互換
    if (courtSettings && Array.isArray(courtSettings) && !dateCourtSettings) {
      for (const cs of courtSettings) {
        let venueName: string | null = null;
        if (cs.venue_id) {
          const venueResult = await db.execute(`SELECT venue_name FROM m_venues WHERE venue_id = ?`, [cs.venue_id]);
          if (venueResult.rows.length > 0) {
            venueName = String(venueResult.rows[0].venue_name);
          }
        }

        await db.execute(`
          UPDATE t_matches_live
          SET court_name = ?, venue_id = ?, venue_name = ?
          WHERE court_number = ? AND match_block_id IN (
            SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
          )
        `, [cs.court_name, cs.venue_id || null, venueName, cs.court_number, tournamentId]);
      }
    }

    // matchOverrides: Array<{ match_id: number, court_name?: string }>
    if (matchOverrides && Array.isArray(matchOverrides)) {
      for (const mo of matchOverrides) {
        if (mo.court_name !== undefined) {
          await db.execute(`
            UPDATE t_matches_live SET court_name = ? WHERE match_id = ?
          `, [mo.court_name, mo.match_id]);
        }
      }
    }

    return NextResponse.json({ success: true, message: '設定を保存しました' });
  } catch (error) {
    console.error('会場・コート設定保存エラー:', error);
    return NextResponse.json(
      { success: false, error: '保存に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
