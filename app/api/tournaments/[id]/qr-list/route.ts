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

    // 大会のformat_idを取得
    const tournamentResult = await db.execute(`
      SELECT format_id FROM t_tournaments WHERE tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id;

    // 試合一覧を取得（BYE試合を除外）
    const matchesResult = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.court_number,
        ml.start_time,
        ml.tournament_date,
        ml.match_status,
        ml.team1_display_name,
        ml.team2_display_name,
        mb.match_block_id,
        mb.block_name,
        mb.phase,
        tt1.team_name as team1_real_name,
        tt2.team_name as team2_real_name,
        tt1.team_omission as team1_real_omission,
        tt2.team_omission as team2_real_omission,
        mt.is_bye_match,
        mt.team1_source,
        mt.team2_source
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
      WHERE mb.tournament_id = ?
      AND ${statusCondition}
      AND (mt.is_bye_match IS NULL OR mt.is_bye_match != 1)
      ORDER BY mb.match_block_id, ml.tournament_date, ml.start_time, ml.match_code
    `, [formatId, tournamentId]);

    // コート番号の一覧を取得
    const courtNumbers = Array.from(
      new Set(matchesResult.rows.map(match => match.court_number as number).filter(Boolean))
    );

    // コート表示名を一括取得
    const courtDisplayNames = await getCourtDisplayNames(tournamentId, courtNumbers);

    // BYE試合でチーム名が取得できない場合、プレースホルダーから実チーム名を解決するためのマップを作成
    const blockPositionToTeamMap: Record<string, { block_name: string; team_name: string; team_omission: string }> = {};

    // assigned_blockとblock_positionから実チーム名を取得してマップ化
    const teamBlockAssignments = await db.execute(`
      SELECT
        assigned_block,
        block_position,
        team_name,
        COALESCE(team_omission, team_name) as team_omission
      FROM t_tournament_teams
      WHERE tournament_id = ? AND assigned_block IS NOT NULL AND block_position IS NOT NULL
    `, [tournamentId]);

    teamBlockAssignments.rows.forEach((row) => {
      const key = `${row.assigned_block}-${row.block_position}`;
      blockPositionToTeamMap[key] = {
        block_name: String(row.assigned_block),
        team_name: String(row.team_name),
        team_omission: String(row.team_omission)
      };
    });

    console.log('[QR-List API] Block position to team map:', blockPositionToTeamMap);

    // プレースホルダー（例: "S1チーム"）からポジション番号を抽出
    const extractPosition = (displayName: string): number | null => {
      const match = String(displayName || '').match(/([A-Za-z]+)(\d+)チーム$/);
      return match ? parseInt(match[2]) : null;
    };

    // BYE試合の勝者をマップに保存
    const byeMatchWinners: Record<string, { name: string; omission: string }> = {};

    // まずBYE試合を処理（is_bye_match=1の試合は既にフィルタで除外されているが、念のため別途取得）
    const byeMatchesResult = await db.execute(`
      SELECT
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        mb.block_name,
        tt1.team_name as team1_real_name,
        tt2.team_name as team2_real_name,
        tt1.team_omission as team1_real_omission,
        tt2.team_omission as team2_real_omission,
        mt.team1_source,
        mt.team2_source
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
      WHERE mb.tournament_id = ? AND mt.is_bye_match = 1
    `, [formatId, tournamentId]);

    byeMatchesResult.rows.forEach((m) => {
      // BYE試合の勝者を特定（空でない方のチーム）
      let winnerName = '';
      let winnerOmission = '';

      if (m.team1_real_name) {
        winnerName = String(m.team1_real_name);
        winnerOmission = String(m.team1_real_omission || m.team1_real_name);
      } else if (m.team2_real_name) {
        winnerName = String(m.team2_real_name);
        winnerOmission = String(m.team2_real_omission || m.team2_real_name);
      } else {
        // tournament_team_idがない場合、display_nameから解決
        const team1Position = m.team1_display_name ? extractPosition(String(m.team1_display_name)) : null;
        const team2Position = m.team2_display_name ? extractPosition(String(m.team2_display_name)) : null;

        if (team1Position !== null && m.block_name) {
          const key = `${m.block_name}-${team1Position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            winnerName = teamData.team_name;
            winnerOmission = teamData.team_omission;
          }
        } else if (team2Position !== null && m.block_name) {
          const key = `${m.block_name}-${team2Position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            winnerName = teamData.team_name;
            winnerOmission = teamData.team_omission;
          }
        }
      }

      if (winnerName && m.match_code) {
        byeMatchWinners[`${m.match_code}_winner`] = { name: winnerName, omission: winnerOmission };
        console.log(`[QR-List] BYE match winner: ${m.match_code} → ${winnerOmission}`);
      }
    });

    // 各試合のQRコード用トークンとURLを生成
    const now = new Date();
    const validFrom = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前から有効
    const validUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48時間後まで有効

    const matches = matchesResult.rows.map((match) => {
      // team1の解決
      let resolvedTeam1Name = String(match.team1_real_name || match.team1_display_name || '');
      let resolvedTeam1Omission = String(match.team1_real_omission || match.team1_display_name || '');

      // team1_real_nameがない場合、プレースホルダーから実チーム名に変換
      if (!match.team1_real_name && match.team1_display_name && match.block_name) {
        const position = extractPosition(String(match.team1_display_name));
        if (position !== null) {
          const key = `${match.block_name}-${position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            resolvedTeam1Name = teamData.team_name;
            resolvedTeam1Omission = teamData.team_omission;
            console.log(`[QR-List] Resolved team1: ${match.team1_display_name} (block=${match.block_name}, pos=${position}) → ${teamData.team_omission}`);
          }
        }
      }

      // team1_sourceに基づいてBYE試合の勝者を反映
      const team1Source = match.team1_source as string | null;
      if (team1Source && byeMatchWinners[team1Source]) {
        resolvedTeam1Name = byeMatchWinners[team1Source].name;
        resolvedTeam1Omission = byeMatchWinners[team1Source].omission;
        console.log(`[QR-List] Resolved team1 from BYE: ${team1Source} → ${resolvedTeam1Omission}`);
      }

      // team2の解決
      let resolvedTeam2Name = String(match.team2_real_name || match.team2_display_name || '');
      let resolvedTeam2Omission = String(match.team2_real_omission || match.team2_display_name || '');

      // team2_real_nameがない場合、プレースホルダーから実チーム名に変換
      if (!match.team2_real_name && match.team2_display_name && match.block_name) {
        const position = extractPosition(String(match.team2_display_name));
        if (position !== null) {
          const key = `${match.block_name}-${position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            resolvedTeam2Name = teamData.team_name;
            resolvedTeam2Omission = teamData.team_omission;
            console.log(`[QR-List] Resolved team2: ${match.team2_display_name} (block=${match.block_name}, pos=${position}) → ${teamData.team_omission}`);
          }
        }
      }

      // team2_sourceに基づいてBYE試合の勝者を反映
      const team2Source = match.team2_source as string | null;
      if (team2Source && byeMatchWinners[team2Source]) {
        resolvedTeam2Name = byeMatchWinners[team2Source].name;
        resolvedTeam2Omission = byeMatchWinners[team2Source].omission;
        console.log(`[QR-List] Resolved team2 from BYE: ${team2Source} → ${resolvedTeam2Omission}`);
      }

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

      // 審判用URLを生成（QRコード経由であることを示すパラメータを追加）
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const refereeUrl = `${baseUrl}/referee/match/${match.match_id}?token=${token}&from=qr`;

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
        team1_name: resolvedTeam1Name,
        team2_name: resolvedTeam2Name,
        team1_omission: resolvedTeam1Omission,
        team2_omission: resolvedTeam2Omission,
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
