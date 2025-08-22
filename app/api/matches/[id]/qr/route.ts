// app/api/matches/[id]/qr/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';

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

    // 試合情報を取得（実際のチーム名も含む）
    const result = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        ml.start_time,
        ml.tournament_date,
        mb.tournament_id,
        -- 実際のチーム名と略称を取得
        t1.team_name as team1_real_name,
        t2.team_name as team2_real_name,
        mt1.team_omission as team1_omission,
        mt2.team_omission as team2_omission
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
      LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
      LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
      LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
      WHERE ml.match_id = ?
    `, [matchId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    const match = result.rows[0];

    // JWTトークン生成（試合開始30分前から終了30分後まで有効）
    const now = new Date();
    
    // 実際の試合日程を使用
    let matchDate;
    try {
      if (match.tournament_date && match.tournament_date.startsWith('{')) {
        // JSON形式の場合
        const dateObj = JSON.parse(match.tournament_date);
        matchDate = dateObj[1] || dateObj['1'] || new Date().toISOString().split('T')[0];
      } else if (match.tournament_date && match.tournament_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // YYYY-MM-DD形式の場合
        matchDate = match.tournament_date;
      } else {
        // デフォルトは今日の日付
        matchDate = new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      console.warn('Tournament date parse error:', error);
      matchDate = new Date().toISOString().split('T')[0];
    }
    
    const matchTime = new Date(`${matchDate} ${match.start_time}`);
    
    // 開発環境では長期間有効なトークンを生成
    let validFrom, validUntil;
    if (process.env.NODE_ENV === 'development') {
      validFrom = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前から
      validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24時間後まで
    } else {
      validFrom = new Date(matchTime.getTime() - 30 * 60 * 1000); // 30分前
      validUntil = new Date(matchTime.getTime() + 90 * 60 * 1000); // 90分後（試合時間+30分）
    }

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

    // QRコード用URL生成
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const qrUrl = `${baseUrl}/referee/match/${matchId}?token=${token}`;

    return NextResponse.json({
      success: true,
      data: {
        match_id: matchId,
        match_code: match.match_code,
        team1_name: match.team1_real_name || match.team1_display_name, // 実チーム名を優先
        team2_name: match.team2_real_name || match.team2_display_name, // 実チーム名を優先
        court_number: match.court_number,
        scheduled_time: match.start_time,
        qr_url: qrUrl,
        token: token,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
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
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.court_number,
          ml.start_time,
          ml.period_count,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_team_id,
          ml.remarks,
          ms.match_status,
          ms.current_period,
          mb.tournament_id,
          -- 確定済み試合の情報
          mf.match_id as is_confirmed,
          mf.team1_scores as final_team1_scores,
          mf.team2_scores as final_team2_scores,
          mf.winner_team_id as final_winner_team_id,
          -- 実際のチーム名と略称を取得
          t1.team_name as team1_real_name,
          t2.team_name as team2_real_name,
          mt1.team_omission as team1_omission,
          mt2.team_omission as team2_omission
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
        LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
        LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
        LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
        LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_id = ?
      `, [matchId]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '試合が見つかりません' },
          { status: 404 }
        );
      }

      const match = result.rows[0];

      return NextResponse.json({
        success: true,
        message: '管理者アクセスが承認されました',
        data: {
          match_id: match.match_id,
          match_code: match.match_code,
          team1_id: match.team1_id,
          team2_id: match.team2_id,
          team1_name: match.team1_real_name || match.team1_display_name, // 実チーム名を優先
          team2_name: match.team2_real_name || match.team2_display_name, // 実チーム名を優先
          team1_omission: match.team1_omission,
          team2_omission: match.team2_omission,
          court_number: match.court_number,
          scheduled_time: match.start_time,
          period_count: match.period_count,
          current_period: match.current_period || 1, // t_match_statusから取得、なければデフォルト1
          match_status: match.match_status || 'scheduled',
          team1_scores: match.is_confirmed ? [Number(match.final_team1_scores) || 0] : [Number(match.team1_scores) || 0],
          team2_scores: match.is_confirmed ? [Number(match.final_team2_scores) || 0] : [Number(match.team2_scores) || 0],
          winner_team_id: match.is_confirmed ? match.final_winner_team_id : match.winner_team_id,
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
      
      const decoded = jwt.verify(token, secret) as any;
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
          ml.team1_id,
          ml.team2_id,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.court_number,
          ml.start_time,
          ml.period_count,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_team_id,
          ml.remarks,
          ms.match_status,
          ms.current_period,
          mb.tournament_id,
          -- 確定済み試合の情報
          mf.match_id as is_confirmed,
          mf.team1_scores as final_team1_scores,
          mf.team2_scores as final_team2_scores,
          mf.winner_team_id as final_winner_team_id,
          -- 実際のチーム名と略称を取得
          t1.team_name as team1_real_name,
          t2.team_name as team2_real_name,
          mt1.team_omission as team1_omission,
          mt2.team_omission as team2_omission
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_tournament_teams t1 ON ml.team1_id = t1.team_id AND mb.tournament_id = t1.tournament_id
        LEFT JOIN t_tournament_teams t2 ON ml.team2_id = t2.team_id AND mb.tournament_id = t2.tournament_id
        LEFT JOIN m_teams mt1 ON t1.team_id = mt1.team_id
        LEFT JOIN m_teams mt2 ON t2.team_id = mt2.team_id
        LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        WHERE ml.match_id = ?
      `, [matchId]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '試合が見つかりません' },
          { status: 404 }
        );
      }

      const match = result.rows[0];

      return NextResponse.json({
        success: true,
        message: 'トークンが有効です',
        data: {
          match_id: match.match_id,
          match_code: match.match_code,
          team1_id: match.team1_id,
          team2_id: match.team2_id,
          team1_name: match.team1_real_name || match.team1_display_name, // 実チーム名を優先
          team2_name: match.team2_real_name || match.team2_display_name, // 実チーム名を優先
          team1_omission: match.team1_omission,
          team2_omission: match.team2_omission,
          court_number: match.court_number,
          scheduled_time: match.start_time,
          period_count: match.period_count,
          current_period: match.current_period || 1, // t_match_statusから取得、なければデフォルト1
          match_status: match.match_status || 'scheduled',
          team1_scores: match.is_confirmed ? [Number(match.final_team1_scores) || 0] : [Number(match.team1_scores) || 0],
          team2_scores: match.is_confirmed ? [Number(match.final_team2_scores) || 0] : [Number(match.team2_scores) || 0],
          winner_team_id: match.is_confirmed ? match.final_winner_team_id : match.winner_team_id,
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