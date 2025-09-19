// app/api/matches/[id]/extended-info/route.ts
// サッカー対応の拡張試合情報を取得するAPI
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SPORT_RULE_CONFIGS } from '@/lib/tournament-rules';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// 動的ルートの設定（静的生成を無効化）
export const dynamic = 'force-dynamic';

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

    // 試合の拡張情報を取得（競技種別・ルール設定含む）
    const result = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.period_count,
        mb.tournament_id,
        tour.sport_type_id,
        sport.sport_code,
        sport.sport_name,
        -- 現在のピリオド設定
        ms.current_period,
        -- 大会ルール設定
        tr_pre.active_periods as preliminary_periods,
        tr_pre.use_extra_time as preliminary_use_extra_time,
        tr_pre.use_penalty as preliminary_use_penalty,
        tr_final.active_periods as final_periods,
        tr_final.use_extra_time as final_use_extra_time,
        tr_final.use_penalty as final_use_penalty,
        -- ブロック情報でフェーズ判定
        mb.phase as match_phase
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      INNER JOIN t_tournaments tour ON mb.tournament_id = tour.tournament_id
      INNER JOIN m_sport_types sport ON tour.sport_type_id = sport.sport_type_id
      LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
      LEFT JOIN t_tournament_rules tr_pre ON tour.tournament_id = tr_pre.tournament_id AND tr_pre.phase = 'preliminary'
      LEFT JOIN t_tournament_rules tr_final ON tour.tournament_id = tr_final.tournament_id AND tr_final.phase = 'final'
      WHERE ml.match_id = ?
    `, [matchId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '試合が見つかりません' },
        { status: 404 }
      );
    }

    const match = result.rows[0];
    
    // 競技種別設定を取得（インライン化でWebpackエラー回避）
    const sportConfig = Object.values(SPORT_RULE_CONFIGS).find(config => 
      config.sport_type_id === Number(match.sport_type_id)
    ) || null;
    
    // 現在の試合フェーズに応じたルール設定を決定
    const isPreliminay = match.match_phase === 'preliminary';
    const activePeriodsJson = isPreliminay ? match.preliminary_periods : match.final_periods;
    
    // 使用可能ピリオドを解析
    let activePeriods: number[] = [1];
    try {
      if (activePeriodsJson) {
        const periods = JSON.parse(String(activePeriodsJson));
        activePeriods = Array.isArray(periods) ? periods.map(p => parseInt(p)) : [1];
      }
    } catch (error) {
      console.warn('Active periods parse error:', error);
      activePeriods = [1]; // フォールバック
    }

    // レスポンス構成
    const responseData = {
      match_id: match.match_id,
      match_code: match.match_code,
      tournament_id: match.tournament_id,
      sport_type_id: match.sport_type_id,
      sport_code: match.sport_code,
      sport_name: match.sport_name,
      match_phase: match.match_phase,
      current_period: match.current_period || 1,
      // 従来のperiod_count（互換性のため）
      period_count: match.period_count || 1,
      // 新しい拡張期間設定
      active_periods: activePeriods,
      max_periods: sportConfig ? sportConfig.default_periods.length : 1,
      sport_config: sportConfig,
      // ルール設定
      rules: {
        phase: match.match_phase,
        use_extra_time: isPreliminay ? match.preliminary_use_extra_time : match.final_use_extra_time,
        use_penalty: isPreliminay ? match.preliminary_use_penalty : match.final_use_penalty,
        active_periods_json: activePeriodsJson
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Extended match info error:', error);
    return NextResponse.json(
      { success: false, error: '拡張試合情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}