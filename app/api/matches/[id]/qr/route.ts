// app/api/matches/[id]/qr/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { getSportScoreConfig } from '@/lib/sport-standings-calculator';
import { parseScoreArray } from '@/lib/score-parser';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// QRコード用トークン生成・取得
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    // 試合情報を取得（実際のチーム名と競技種別も含む）
    const result = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.team1_tournament_team_id,
        ml.team2_tournament_team_id,
        ml.court_number,
        tc.court_name,
        ml.start_time,
        ml.tournament_date,
        mb.tournament_id,
        -- 実際のチーム名と略称を取得（t_tournament_teamsの略称を優先）
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name,
        COALESCE(t1.team_omission, mt1.team_omission) as team1_omission,
        COALESCE(t2.team_omission, mt2.team_omission) as team2_omission,
        -- 多競技対応：競技種別を取得
        st.sport_code,
        st.sport_name
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      INNER JOIN t_tournaments tour ON mb.tournament_id = tour.tournament_id
      LEFT JOIN m_sport_types st ON tour.sport_type_id = st.sport_type_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_tournament_team_id = t1.tournament_team_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_tournament_team_id = t2.tournament_team_id
      LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
      LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
      LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
      WHERE ml.match_id = ?
    `, [matchId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    const match = result.rows[0];

    // 多競技対応：競技種別設定を取得
    const sportCode = String(match.sport_code || 'pk_championship');
    const sportConfig = getSportScoreConfig(sportCode);

    // JWTトークン生成（試合開始30分前から終了30分後まで有効）
    const now = new Date();

    // トークン有効期限の設定
    // QRコード発行時点から48時間有効（前日のQRコード一覧作成に対応）
    const validFrom = new Date(now.getTime() - 60 * 60 * 1000); // 発行1時間前から有効
    const validUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 発行から48時間後まで有効

    const payload = {
      match_id: matchId,
      match_code: match.match_code,
      tournament_id: match.tournament_id,
      iat: Math.floor(now.getTime() / 1000),
      nbf: Math.floor(validFrom.getTime() / 1000), // Not Before
      exp: Math.floor(validUntil.getTime() / 1000), // Expires
    };

    const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
    console.log('Generating JWT token with payload:', payload);
    console.log('Using secret length:', secret.length);
    const token = jwt.sign(payload, secret);
    console.log('Generated token length:', token.length);

    // QRコード用URL生成（QRコード経由であることを示すパラメータを追加）
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const qrUrl = `${baseUrl}/referee/match/${matchId}?token=${token}&from=qr`;

    return NextResponse.json({
      success: true,
      data: {
        match_id: matchId,
        match_code: match.match_code,
        team1_name: match.team1_real_name || match.team1_display_name, // 実チーム名を優先
        team2_name: match.team2_real_name || match.team2_display_name, // 実チーム名を優先
        court_number: match.court_number,
        court_name: match.court_name ? String(match.court_name) : null,
        scheduled_time: match.start_time,
        qr_url: qrUrl,
        token: token,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        // 多競技対応：スポーツ設定を追加
        sport_config: sportConfig,
        qr_data: {
          url: qrUrl,
          size: 200,
          format: 'png'
        }
      }
    });

  } catch (error) {
    console.error('QR generation error:', error);
    return NextResponse.json(
      { success: false, error: 'QRコードの生成に失敗しました' },
      { status: 500 }
    );
  }
}

// QRトークンの検証
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);
    const { token } = await request.json();

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'トークンが必要です' },
        { status: 400 }
      );
    }

    // 管理者用特別トークンの処理
    if (token === 'admin') {
      // 簡易的な管理者認証（セッション確認は省略）
      // 試合情報を取得（実チーム名と略称も含む）
      const result = await db.execute(`
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.court_number,
          tc.court_name,
          ml.start_time,
          ml.period_count,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_tournament_team_id,
          ml.remarks,
          ms.match_status,
          ms.current_period,
          mb.tournament_id,
          mb.block_name,
          tour.format_id,
          -- 確定済み試合の情報
          mf.match_id as is_confirmed,
          mf.team1_scores as final_team1_scores,
          mf.team2_scores as final_team2_scores,
          mf.winner_tournament_team_id as final_winner_tournament_team_id,
          -- 実際のチーム名と略称を取得（t_tournament_teamsの略称を優先）
          t1.team_name as team1_real_name,
          t2.team_name as team2_real_name,
          COALESCE(t1.team_omission, mt1.team_omission) as team1_omission,
          COALESCE(t2.team_omission, mt2.team_omission) as team2_omission,
          -- BYE試合の勝者解決用
          mmt.team1_source,
          mmt.team2_source
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        INNER JOIN t_tournaments tour ON mb.tournament_id = tour.tournament_id
        LEFT JOIN t_tournament_teams t1 ON ml.team1_tournament_team_id = t1.tournament_team_id
        LEFT JOIN t_tournament_teams t2 ON ml.team2_tournament_team_id = t2.tournament_team_id
        LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
        LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
        LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
        LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mmt ON mmt.format_id = tour.format_id AND mmt.match_code = ml.match_code
        WHERE ml.match_id = ?
      `, [matchId]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '試合が見つかりません' },
          { status: 404 }
        );
      }

      const match = result.rows[0];

      // BYE試合の勝者を解決するためのマップを構築
      const { resolvedTeam1Name, resolvedTeam1Omission, resolvedTeam2Name, resolvedTeam2Omission } =
        await resolveByeMatchWinners(
          match.tournament_id as number,
          match.format_id as number,
          match.block_name as string | null,
          match.team1_real_name as string | null,
          match.team1_display_name as string | null,
          match.team1_omission as string | null,
          match.team1_source as string | null,
          match.team2_real_name as string | null,
          match.team2_display_name as string | null,
          match.team2_omission as string | null,
          match.team2_source as string | null
        );

      return NextResponse.json({
        success: true,
        message: '管理者アクセスが承認されました',
        data: {
          match_id: match.match_id,
          match_code: match.match_code,
          team1_tournament_team_id: match.team1_tournament_team_id,
          team2_tournament_team_id: match.team2_tournament_team_id,
          team1_name: resolvedTeam1Name,
          team2_name: resolvedTeam2Name,
          team1_omission: resolvedTeam1Omission,
          team2_omission: resolvedTeam2Omission,
          court_number: match.court_number,
          court_name: match.court_name ? String(match.court_name) : null,
          scheduled_time: match.start_time,
          period_count: match.period_count,
          current_period: match.current_period || 1, // t_match_statusから取得、なければデフォルト1
          match_status: match.match_status || 'scheduled',
          team1_scores: match.is_confirmed
            ? (match.final_team1_scores ? parseScoreArray(match.final_team1_scores) : null)
            : (match.team1_scores ? parseScoreArray(match.team1_scores) : null),
          team2_scores: match.is_confirmed
            ? (match.final_team2_scores ? parseScoreArray(match.final_team2_scores) : null)
            : (match.team2_scores ? parseScoreArray(match.team2_scores) : null),
          winner_tournament_team_id: match.is_confirmed ? match.final_winner_tournament_team_id : match.winner_tournament_team_id,
          is_confirmed: !!match.is_confirmed,
          remarks: match.remarks,
          tournament_id: match.tournament_id,
          referee_access: true,
          admin_access: true
        }
      });
    }

    try {
      const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
      console.log('Attempting JWT verification with secret length:', secret.length);
      console.log('Token to verify:', token?.substring(0, 50) + '...');
      console.log('Expected match ID:', matchId);
      
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { match_id: number };
      console.log('JWT decoded successfully:', { match_id: decoded.match_id, exp: decoded.exp, iat: decoded.iat });

      // トークンの試合IDが一致するかチェック
      if (decoded.match_id !== matchId) {
        return NextResponse.json(
          { success: false, error: 'トークンが無効です' },
          { status: 401 }
        );
      }

      // 試合情報を取得（実チーム名も含む）
      const result = await db.execute(`
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.court_number,
          tc.court_name,
          ml.start_time,
          ml.period_count,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_tournament_team_id,
          ml.remarks,
          ms.match_status,
          ms.current_period,
          mb.tournament_id,
          mb.block_name,
          tour.format_id,
          -- 確定済み試合の情報
          mf.match_id as is_confirmed,
          mf.team1_scores as final_team1_scores,
          mf.team2_scores as final_team2_scores,
          mf.winner_tournament_team_id as final_winner_tournament_team_id,
          -- 実際のチーム名と略称を取得（t_tournament_teamsの略称を優先）
          t1.team_name as team1_real_name,
          t2.team_name as team2_real_name,
          COALESCE(t1.team_omission, mt1.team_omission) as team1_omission,
          COALESCE(t2.team_omission, mt2.team_omission) as team2_omission,
          -- BYE試合の勝者解決用
          mmt.team1_source,
          mmt.team2_source
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        INNER JOIN t_tournaments tour ON mb.tournament_id = tour.tournament_id
        LEFT JOIN t_tournament_teams t1 ON ml.team1_tournament_team_id = t1.tournament_team_id
        LEFT JOIN t_tournament_teams t2 ON ml.team2_tournament_team_id = t2.tournament_team_id
        LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
        LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
        LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
        LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_match_templates mmt ON mmt.format_id = tour.format_id AND mmt.match_code = ml.match_code
        WHERE ml.match_id = ?
      `, [matchId]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '試合が見つかりません' },
          { status: 404 }
        );
      }

      const match = result.rows[0];

      // BYE試合の勝者を解決するためのマップを構築
      const { resolvedTeam1Name, resolvedTeam1Omission, resolvedTeam2Name, resolvedTeam2Omission } =
        await resolveByeMatchWinners(
          match.tournament_id as number,
          match.format_id as number,
          match.block_name as string | null,
          match.team1_real_name as string | null,
          match.team1_display_name as string | null,
          match.team1_omission as string | null,
          match.team1_source as string | null,
          match.team2_real_name as string | null,
          match.team2_display_name as string | null,
          match.team2_omission as string | null,
          match.team2_source as string | null
        );

      return NextResponse.json({
        success: true,
        message: 'トークンが有効です',
        data: {
          match_id: match.match_id,
          match_code: match.match_code,
          team1_tournament_team_id: match.team1_tournament_team_id,
          team2_tournament_team_id: match.team2_tournament_team_id,
          team1_name: resolvedTeam1Name,
          team2_name: resolvedTeam2Name,
          team1_omission: resolvedTeam1Omission,
          team2_omission: resolvedTeam2Omission,
          court_number: match.court_number,
          court_name: match.court_name ? String(match.court_name) : null,
          scheduled_time: match.start_time,
          period_count: match.period_count,
          current_period: match.current_period || 1, // t_match_statusから取得、なければデフォルト1
          match_status: match.match_status || 'scheduled',
          team1_scores: match.is_confirmed
            ? (match.final_team1_scores ? parseScoreArray(match.final_team1_scores) : null)
            : (match.team1_scores ? parseScoreArray(match.team1_scores) : null),
          team2_scores: match.is_confirmed
            ? (match.final_team2_scores ? parseScoreArray(match.final_team2_scores) : null)
            : (match.team2_scores ? parseScoreArray(match.team2_scores) : null),
          winner_tournament_team_id: match.is_confirmed ? match.final_winner_tournament_team_id : match.winner_tournament_team_id,
          is_confirmed: !!match.is_confirmed,
          remarks: match.remarks,
          tournament_id: match.tournament_id,
          referee_access: true
        }
      });

    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
      console.error('Token that failed:', token);
      console.error('Match ID:', matchId);
      return NextResponse.json(
        { 
          success: false, 
          error: 'トークンの有効期限が切れているか、無効です',
          details: process.env.NODE_ENV === 'development' ? String(jwtError) : undefined,
          debug: process.env.NODE_ENV === 'development' ? {
            tokenLength: token?.length,
            tokenStart: token?.substring(0, 20),
            matchId: matchId
          } : undefined
        },
        { status: 401 }
      );
    }

  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの検証に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * BYE試合の勝者を解決するヘルパー関数
 */
async function resolveByeMatchWinners(
  tournamentId: number,
  formatId: number,
  blockName: string | null,
  team1RealName: string | null,
  team1DisplayName: string | null,
  team1Omission: string | null,
  team1Source: string | null,
  team2RealName: string | null,
  team2DisplayName: string | null,
  team2Omission: string | null,
  team2Source: string | null
): Promise<{
  resolvedTeam1Name: string;
  resolvedTeam1Omission: string;
  resolvedTeam2Name: string;
  resolvedTeam2Omission: string;
}> {
  // 初期値を設定
  let resolvedTeam1Name = team1RealName || team1DisplayName || '';
  let resolvedTeam1Omission = team1Omission || team1DisplayName || '';
  let resolvedTeam2Name = team2RealName || team2DisplayName || '';
  let resolvedTeam2Omission = team2Omission || team2DisplayName || '';

  // プレースホルダー解決用のマップを構築
  const blockPositionToTeamMap: Record<string, { team_name: string; team_omission: string }> = {};

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
      team_name: String(row.team_name),
      team_omission: String(row.team_omission)
    };
  });

  // プレースホルダーからポジション番号を抽出
  const extractPosition = (displayName: string): number | null => {
    const match = String(displayName || '').match(/([A-Za-z]+)(\d+)チーム$/);
    return match ? parseInt(match[2]) : null;
  };

  // team1がプレースホルダーの場合、実チーム名に変換
  if (!team1RealName && team1DisplayName && blockName) {
    const position = extractPosition(team1DisplayName);
    if (position !== null) {
      const key = `${blockName}-${position}`;
      const teamData = blockPositionToTeamMap[key];
      if (teamData) {
        resolvedTeam1Name = teamData.team_name;
        resolvedTeam1Omission = teamData.team_omission;
      }
    }
  }

  // team2がプレースホルダーの場合、実チーム名に変換
  if (!team2RealName && team2DisplayName && blockName) {
    const position = extractPosition(team2DisplayName);
    if (position !== null) {
      const key = `${blockName}-${position}`;
      const teamData = blockPositionToTeamMap[key];
      if (teamData) {
        resolvedTeam2Name = teamData.team_name;
        resolvedTeam2Omission = teamData.team_omission;
      }
    }
  }

  // BYE試合の勝者をマップに保存
  const byeMatchWinners: Record<string, { name: string; omission: string }> = {};

  const byeMatchesResult = await db.execute(`
    SELECT
      ml.match_code,
      ml.team1_display_name,
      ml.team2_display_name,
      mb.block_name,
      tt1.team_name as team1_real_name,
      tt2.team_name as team2_real_name,
      tt1.team_omission as team1_real_omission,
      tt2.team_omission as team2_real_omission
    FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
    LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
    LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code
    WHERE mb.tournament_id = ? AND mt.is_bye_match = 1
  `, [formatId, tournamentId]);

  byeMatchesResult.rows.forEach((m) => {
    let winnerName = '';
    let winnerOmission = '';

    if (m.team1_real_name) {
      winnerName = String(m.team1_real_name);
      winnerOmission = String(m.team1_real_omission || m.team1_real_name);
    } else if (m.team2_real_name) {
      winnerName = String(m.team2_real_name);
      winnerOmission = String(m.team2_real_omission || m.team2_real_name);
    } else {
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
    }
  });

  // team1_sourceに基づいてBYE試合の勝者を反映
  if (team1Source && byeMatchWinners[team1Source]) {
    resolvedTeam1Name = byeMatchWinners[team1Source].name;
    resolvedTeam1Omission = byeMatchWinners[team1Source].omission;
  }

  // team2_sourceに基づいてBYE試合の勝者を反映
  if (team2Source && byeMatchWinners[team2Source]) {
    resolvedTeam2Name = byeMatchWinners[team2Source].name;
    resolvedTeam2Omission = byeMatchWinners[team2Source].omission;
  }

  return {
    resolvedTeam1Name,
    resolvedTeam1Omission,
    resolvedTeam2Name,
    resolvedTeam2Omission
  };
}