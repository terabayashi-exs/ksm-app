import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { getCourtDisplayNames } from '@/lib/court-name-helper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);

    // クエリパラメータから試合ステータスフィルターを取得
    const { searchParams } = new URL(request.url);
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    // 試合ステータスの条件を動的に構築
    const statusCondition = includeCompleted
      ? "ml.match_status IN ('scheduled', 'ongoing', 'completed')"
      : "ml.match_status IN ('scheduled', 'ongoing')";

    // 試合一覧を取得
    const matchesResult = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.court_number,
        ml.start_time,
        ml.tournament_date,
        ml.match_status,
        mb.match_block_id,
        mb.block_name,
        mb.phase,
        COALESCE(tt1.team_name, ml.team1_display_name) as team1_name,
        COALESCE(tt2.team_name, ml.team2_display_name) as team2_name,
        COALESCE(tt1.team_omission, ml.team1_display_name) as team1_omission,
        COALESCE(tt2.team_omission, ml.team2_display_name) as team2_omission
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id = ?
      AND ${statusCondition}
      AND ml.team1_id IS NOT NULL
      AND ml.team2_id IS NOT NULL
      ORDER BY mb.match_block_id, ml.tournament_date, ml.start_time, ml.match_code
    `, [tournamentId]);

    // コート番号の一覧を取得
    const courtNumbers = Array.from(
      new Set(matchesResult.rows.map(match => match.court_number as number).filter(Boolean))
    );

    // コート表示名を一括取得
    const courtDisplayNames = await getCourtDisplayNames(tournamentId, courtNumbers);

    // 各試合のQRコード用トークンとURLを生成
    const now = new Date();
    const validFrom = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前から有効
    const validUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48時間後まで有効

    const matches = matchesResult.rows.map((match) => {
      // JWTトークン生成
      const payload = {
        match_id: match.match_id,
        match_code: match.match_code,
        tournament_id: tournamentId,
        iat: Math.floor(now.getTime() / 1000),
        nbf: Math.floor(validFrom.getTime() / 1000),
        exp: Math.floor(validUntil.getTime() / 1000),
      };

      const token = jwt.sign(
        payload,
        process.env.NEXTAUTH_SECRET || 'fallback-secret',
        { algorithm: 'HS256' }
      );

      // 審判用URLを生成
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const refereeUrl = `${baseUrl}/referee/match/${match.match_id}?token=${token}`;

      // QRコード画像URLを生成
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(refereeUrl)}`;

      // コート表示名を取得
      const courtNumber = match.court_number as number;
      const courtName = courtDisplayNames[courtNumber] || String(courtNumber);

      return {
        match_id: match.match_id,
        match_code: match.match_code,
        match_block_id: match.match_block_id,
        court_number: match.court_number,
        court_name: courtName,
        start_time: typeof match.start_time === 'string' ? match.start_time.substring(0, 5) : '--:--',
        tournament_date: match.tournament_date || '',
        match_status: match.match_status,
        block_name: match.block_name,
        phase: match.phase,
        team1_name: match.team1_name,
        team2_name: match.team2_name,
        team1_omission: match.team1_omission,
        team2_omission: match.team2_omission,
        referee_url: refereeUrl,
        qr_image_url: qrImageUrl,
      };
    });

    return NextResponse.json({
      success: true,
      matches,
      total: matches.length,
      validity: {
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
      }
    });

  } catch (error) {
    console.error('QR一覧取得エラー:', error);
    return NextResponse.json(
      { error: 'QRコード一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
