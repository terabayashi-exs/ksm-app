// app/api/matches/[id]/scores-extended/route.ts
// サッカー対応の複数ピリオドスコア管理API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface PeriodScore {
  period: number;
  team1_score: number;
  team2_score: number;
}

interface ExtendedScoreUpdate {
  period_scores: PeriodScore[];
  winner_team_id?: string;
  is_draw?: boolean;
  remarks?: string;
  updated_by: string;
  // PK戦データの追加
  pk_mode?: boolean;
  regular_scores?: { team1: number; team2: number };
  pk_scores?: { team1: number; team2: number };
}

// スコアデータ取得（拡張版）
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

    // 現在のスコアデータを取得
    const result = await db.execute(`
      SELECT 
        ml.match_id,
        ml.team1_scores,
        ml.team2_scores,
        ml.winner_team_id,
        ml.period_count,
        ms.current_period,
        -- 確定済みかチェック
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
        mf.team1_scores as final_team1_scores,
        mf.team2_scores as final_team2_scores
      FROM t_matches_live ml
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
    
    // スコアデータを解析（JSON文字列または数値として保存されている可能性）
    let team1Scores: number[] = [];
    let team2Scores: number[] = [];

    try {
      // 確定済みの場合は確定データを使用
      if (match.is_confirmed) {
        const finalTeam1 = match.final_team1_scores;
        const finalTeam2 = match.final_team2_scores;
        
        if (typeof finalTeam1 === 'string') {
          team1Scores = JSON.parse(finalTeam1);
        } else {
          team1Scores = [Number(finalTeam1) || 0];
        }
        
        if (typeof finalTeam2 === 'string') {
          team2Scores = JSON.parse(finalTeam2);
        } else {
          team2Scores = [Number(finalTeam2) || 0];
        }
      } else {
        // 進行中データを使用
        if (typeof match.team1_scores === 'string') {
          team1Scores = JSON.parse(match.team1_scores);
        } else if (match.team1_scores !== null) {
          team1Scores = [Number(match.team1_scores) || 0];
        } else {
          team1Scores = [];
        }
        
        if (typeof match.team2_scores === 'string') {
          team2Scores = JSON.parse(match.team2_scores);
        } else if (match.team2_scores !== null) {
          team2Scores = [Number(match.team2_scores) || 0];
        } else {
          team2Scores = [];
        }
      }
    } catch (parseError) {
      console.warn('Score parsing error:', parseError);
      team1Scores = [0];
      team2Scores = [0];
    }

    // ピリオド別スコア構造に変換
    const periodScores: PeriodScore[] = [];
    const maxPeriods = Math.max(team1Scores.length, team2Scores.length, Number(match.period_count) || 1);
    
    for (let i = 0; i < maxPeriods; i++) {
      periodScores.push({
        period: i + 1,
        team1_score: team1Scores[i] || 0,
        team2_score: team2Scores[i] || 0
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        match_id: matchId,
        period_count: match.period_count || 1,
        current_period: match.current_period || 1,
        is_confirmed: !!match.is_confirmed,
        period_scores: periodScores,
        total_scores: {
          team1: team1Scores.reduce((sum, score) => sum + (Number(score) || 0), 0),
          team2: team2Scores.reduce((sum, score) => sum + (Number(score) || 0), 0)
        },
        winner_team_id: match.winner_team_id
      }
    });

  } catch (error) {
    console.error('Extended scores get error:', error);
    return NextResponse.json(
      { success: false, error: 'スコアデータの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 複数ピリオドスコア更新
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const matchId = parseInt(resolvedParams.id);
    const updateData: ExtendedScoreUpdate = await request.json();

    if (isNaN(matchId)) {
      return NextResponse.json(
        { success: false, error: '無効な試合IDです' },
        { status: 400 }
      );
    }

    // 入力データの検証
    if (!updateData.period_scores || !Array.isArray(updateData.period_scores)) {
      return NextResponse.json(
        { success: false, error: 'ピリオド別スコアデータが必要です' },
        { status: 400 }
      );
    }

    // 試合の確定状況をチェック
    const matchCheck = await db.execute(`
      SELECT mf.match_id as is_confirmed
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE ml.match_id = ?
    `, [matchId]);

    if (matchCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    if (matchCheck.rows[0].is_confirmed) {
      return NextResponse.json(
        { success: false, error: 'この試合は既に確定済みです' },
        { status: 400 }
      );
    }

    // スコア配列を構築
    const team1Scores: number[] = [];
    const team2Scores: number[] = [];
    
    updateData.period_scores.forEach(periodScore => {
      const periodIndex = periodScore.period - 1;
      
      // 配列サイズを拡張
      while (team1Scores.length <= periodIndex) {
        team1Scores.push(0);
      }
      while (team2Scores.length <= periodIndex) {
        team2Scores.push(0);
      }
      
      team1Scores[periodIndex] = Number(periodScore.team1_score) || 0;
      team2Scores[periodIndex] = Number(periodScore.team2_score) || 0;
    });

    // PK戦データの処理
    let finalRemarks = updateData.remarks || null;
    let pkDataForRemarks = '';
    
    if (updateData.pk_mode && updateData.regular_scores && updateData.pk_scores) {
      // PK戦データを備考に記録
      pkDataForRemarks = `[PK戦] 通常: ${updateData.regular_scores.team1}-${updateData.regular_scores.team2}, PK: ${updateData.pk_scores.team1}-${updateData.pk_scores.team2}`;
      if (finalRemarks) {
        finalRemarks = `${finalRemarks}\n${pkDataForRemarks}`;
      } else {
        finalRemarks = pkDataForRemarks;
      }
      
      console.log('PK戦データを処理しました:', {
        regular: updateData.regular_scores,
        pk: updateData.pk_scores,
        remarks: pkDataForRemarks
      });
    }

    // データベース更新
    await db.execute(`
      UPDATE t_matches_live 
      SET 
        team1_scores = ?,
        team2_scores = ?,
        winner_team_id = ?,
        remarks = ?,
        updated_at = datetime('now', '+9 hours')
      WHERE match_id = ?
    `, [
      JSON.stringify(team1Scores),
      JSON.stringify(team2Scores),
      updateData.winner_team_id || null,
      finalRemarks,
      matchId
    ]);

    const responseData: {
      match_id: number;
      period_scores: PeriodScore[];
      total_scores: { team1: number; team2: number };
      winner_team_id?: string;
      pk_data?: {
        pk_mode: boolean;
        regular_scores?: { team1: number; team2: number };
        pk_scores?: { team1: number; team2: number };
      };
      message?: string;
    } = {
      match_id: matchId,
      period_scores: updateData.period_scores,
      total_scores: {
        team1: team1Scores.reduce((sum, score) => sum + score, 0),
        team2: team2Scores.reduce((sum, score) => sum + score, 0)
      },
      winner_team_id: updateData.winner_team_id
    };

    // PK戦データをレスポンスに含める
    if (updateData.pk_mode) {
      responseData.pk_data = {
        pk_mode: true,
        regular_scores: updateData.regular_scores,
        pk_scores: updateData.pk_scores
      };
      responseData.message = 'PK戦データを含むスコアを更新しました';
    } else {
      responseData.message = 'スコアを更新しました';
    }

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Extended scores update error:', error);
    return NextResponse.json(
      { success: false, error: 'スコア更新に失敗しました' },
      { status: 500 }
    );
  }
}