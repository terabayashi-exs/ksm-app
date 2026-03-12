// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentPublicMatches } from '@/lib/tournament-public-matches';
import { db } from '@/lib/db';

// キャッシュはCache-Controlヘッダーで制御

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の公開用試合一覧を取得（認証不要）
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  console.log('API called with params:', params);
  console.log('Params type:', typeof params);

  let tournamentId: number = 0; // Initialize with default value

  try {
    // Next.js 15対応：paramsは常にPromise
    const resolvedParams = await params;

    console.log('Resolved params:', resolvedParams);

    if (!resolvedParams || !resolvedParams.id) {
      console.log('No ID found in params');
      return NextResponse.json(
        { success: false, error: 'パラメータが不正です' },
        { status: 400 }
      );
    }

    const tournamentIdStr = resolvedParams.id;
    console.log('Tournament ID string:', tournamentIdStr);

    tournamentId = parseInt(tournamentIdStr);
    console.log('Parsed tournament ID:', tournamentId);

    if (isNaN(tournamentId) || !tournamentIdStr) {
      console.log('Invalid tournament ID - NaN or empty');
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    const result = await getTournamentPublicMatches(tournamentId);

    if (result === null) {
      return NextResponse.json(
        { success: false, error: '指定された大会が存在しません' },
        { status: 404 }
      );
    }

    // 部門に紐づく会場マスタ情報を取得（t_tournaments + t_matches_live 両方から収集）
    let venues: Array<{ venue_id: number; venue_name: string; google_maps_url: string | null }> = [];
    try {
      const venueIds = new Set<number>();

      // 1. 部門に設定された会場
      const tournamentRow = await db.execute(`SELECT venue_id FROM t_tournaments WHERE tournament_id = ?`, [tournamentId]);
      const venueIdJson = tournamentRow.rows[0]?.venue_id;
      if (venueIdJson) {
        const venueIdStr = String(venueIdJson);
        const normalizedJson = venueIdStr.startsWith('[') ? venueIdStr : `[${venueIdStr}]`;
        try {
          const ids = JSON.parse(normalizedJson) as number[];
          ids.forEach(id => venueIds.add(id));
        } catch { /* ignore parse error */ }
      }

      // 2. 試合に設定された会場
      const matchVenueResult = await db.execute(`
        SELECT DISTINCT ml.venue_id
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND ml.venue_id IS NOT NULL
      `, [tournamentId]);
      matchVenueResult.rows.forEach(r => {
        if (r.venue_id) venueIds.add(Number(r.venue_id));
      });

      if (venueIds.size > 0) {
        const idList = Array.from(venueIds).join(',');
        const venueResult = await db.execute(`
          SELECT venue_id, venue_name, google_maps_url
          FROM m_venues WHERE venue_id IN (${idList})
        `);
        venues = venueResult.rows.map(r => ({
          venue_id: Number(r.venue_id),
          venue_name: String(r.venue_name),
          google_maps_url: r.google_maps_url ? String(r.google_maps_url) : null,
        }));
      }
    } catch (venueError) {
      console.warn('会場情報取得エラー:', venueError);
    }

    return new Response(JSON.stringify({
      success: true,
      data: result,
      venues,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    console.error('公開試合データ取得エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    console.error('Tournament ID:', tournamentId);
    console.error('Full error object:', JSON.stringify(error, null, 2));

    return NextResponse.json(
      {
        success: false,
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack available',
        tournamentId: tournamentId
      },
      { status: 500 }
    );
  }
}
