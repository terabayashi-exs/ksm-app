import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTournamentSportCode, getSportScoreConfig, extractSoccerScoreData } from '@/lib/sport-standings-calculator';
import { parseScoreArray, parseTotalScore } from '@/lib/score-parser';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid tournament ID' },
        { status: 400 }
      );
    }

    // クエリパラメータからphaseを取得（デフォルトは'final'）
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get('phase') || 'final';

    // phaseのバリデーション
    if (phase !== 'preliminary' && phase !== 'final') {
      return NextResponse.json(
        { success: false, error: 'Invalid phase parameter' },
        { status: 400 }
      );
    }

    // 多競技対応：スポーツ設定を取得
    const sportCode = await getTournamentSportCode(tournamentId);
    const sportConfig = getSportScoreConfig(sportCode);

    // 大会のformat_idとtarget_team_countを取得
    const tournamentResult = await db.execute(
      `SELECT t.format_id, f.target_team_count
       FROM t_tournaments t
       JOIN m_tournament_formats f ON t.format_id = f.format_id
       WHERE t.tournament_id = ?`,
      [tournamentId]
    );

    if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id as number;
    const targetTeamCount = tournamentResult.rows[0].target_team_count as number;

    // まず基本的なクエリでデータを取得（多競技対応データ含む）
    const query = `
      SELECT DISTINCT
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_tournament_team_id,
        ml.team2_tournament_team_id,
        COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name) as team1_display_name,
        COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name) as team2_display_name,
        COALESCE(mf.team1_scores, '0') as team1_goals,
        COALESCE(mf.team2_scores, '0') as team2_goals,
        -- 多競技対応の拡張データ
        ml.team1_scores as live_team1_scores,
        ml.team2_scores as live_team2_scores,
        ml.period_count as live_period_count,
        mf.winner_team_id,
        mf.winner_tournament_team_id,
        COALESCE(mf.is_draw, 0) as is_draw,
        COALESCE(mf.is_walkover, mt.is_bye_match, 0) as is_walkover,
        ml.match_status,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
        ml.match_number as execution_priority,
        ml.start_time,
        ml.court_number,
        mb.match_type,
        mb.block_name,
        mb.display_round_name,
        mt.position_note,
        mt.team1_source,
        mt.team2_source,
        mt.is_bye_match
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_rules tr ON mb.tournament_id = tr.tournament_id AND tr.phase = mb.phase
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = ?
      WHERE mb.tournament_id = ?
        AND mb.phase = ?
      ORDER BY ml.match_number, ml.match_code
    `;

    // execution_groupは現在のスキーマでは利用不可

    const matches = await db.execute(query, [formatId, phase, tournamentId, phase]);

    // トーナメント試合が存在しない場合は404を返す
    if (!matches.rows || matches.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'この大会にはトーナメント戦がありません' },
        { status: 404 }
      );
    }

    // execution_groupは現在のスキーマでは利用不可のため、nullに設定
    const executionGroupMap = new Map<string, number>();

    // BYE試合の勝者を解決するためのマップを作成
    const byeMatchWinners: Record<string, string> = {};

    matches.rows.forEach(row => {
      if (row.is_walkover) {
        // BYE試合の勝者を特定（空でない方のチーム）
        const winner = row.team1_display_name || row.team2_display_name;
        if (winner && row.match_code) {
          byeMatchWinners[`【${row.match_code}】勝`] = String(winner);
          console.log(`[bracket] BYE試合勝者マップ: 【${row.match_code}】勝 → ${winner}`);
        }
      }
    });

    console.log('[bracket] BYE試合勝者マップ全体:', byeMatchWinners);

    // データを整形（多競技対応）
    const bracketData = matches.rows.map(row => {
      // スコアデータをパース（確定済みスコアを優先）
      const team1GoalsData = row.team1_goals as string | null;
      const team2GoalsData = row.team2_goals as string | null;

      const isWalkover = Boolean(row.is_walkover);

      // チーム名の解決（BYE試合の勝者を実名に置き換え）
      let team1DisplayName = row.team1_display_name as string;
      let team2DisplayName = row.team2_display_name as string;

      // 【S1】勝のような表記をBYE試合の勝者名に置き換え
      if (byeMatchWinners[team1DisplayName]) {
        team1DisplayName = byeMatchWinners[team1DisplayName];
        console.log(`[bracket] ${row.match_code}: team1 ${row.team1_display_name} → ${team1DisplayName}`);
      }
      if (byeMatchWinners[team2DisplayName]) {
        team2DisplayName = byeMatchWinners[team2DisplayName];
        console.log(`[bracket] ${row.match_code}: team2 ${row.team2_display_name} → ${team2DisplayName}`);
      }

      const baseData = {
        match_id: row.match_id as number,
        match_code: row.match_code as string,
        team1_id: row.team1_id as string | undefined,
        team2_id: row.team2_id as string | undefined,
        team1_tournament_team_id: row.team1_tournament_team_id as number | null,
        team2_tournament_team_id: row.team2_tournament_team_id as number | null,
        team1_display_name: team1DisplayName,
        team2_display_name: team2DisplayName,
        team1_goals: team1GoalsData ? parseTotalScore(team1GoalsData) : 0,
        team2_goals: team2GoalsData ? parseTotalScore(team2GoalsData) : 0,
        winner_team_id: row.winner_team_id as string | null,
        winner_tournament_team_id: row.winner_tournament_team_id as number | null,
        is_draw: Boolean(row.is_draw),
        is_walkover: isWalkover,
        match_status: row.match_status as 'scheduled' | 'ongoing' | 'completed' | 'cancelled',
        is_confirmed: Boolean(row.is_confirmed),
        execution_priority: row.execution_priority as number,
        start_time: row.start_time as string | null,
        court_number: row.court_number as number | null,
        execution_group: executionGroupMap.get(row.match_code as string) || null,
        match_type: row.match_type as string,
        block_name: row.block_name as string,
        display_round_name: row.display_round_name as string | undefined,
        position_note: row.position_note as string | undefined,
        team1_source: row.team1_source as string | undefined,
        team2_source: row.team2_source as string | undefined,
        is_bye_match: Boolean(row.is_bye_match || 0),
      };

      // デバッグログ
      if (isWalkover) {
        console.log(`[bracket] Bye match detected: ${row.match_code as string} - winner: ${row.team1_display_name || row.team2_display_name}`);
      }

      // 多競技対応の拡張データを追加
      try {
        const liveTeam1ScoresStr = row.live_team1_scores as string | null;
        const liveTeam2ScoresStr = row.live_team2_scores as string | null;
        const livePeriodCount = row.live_period_count as number | null;

        if (liveTeam1ScoresStr && liveTeam2ScoresStr) {
          // parseScoreArray()で全形式に対応
          const team1Scores = parseScoreArray(liveTeam1ScoresStr);
          const team2Scores = parseScoreArray(liveTeam2ScoresStr);

          // period_countからactive_periodsを生成
          let activePeriods: number[] = [];
          if (livePeriodCount && livePeriodCount > 0) {
            activePeriods = Array.from({ length: livePeriodCount }, (_, i) => i + 1);
          }

          Object.assign(baseData, {
            team1_scores: team1Scores,
            team2_scores: team2Scores,
            active_periods: activePeriods
          });

          // サッカーの場合はPKデータを抽出
          if (sportCode === 'soccer' && baseData.is_confirmed && baseData.team1_id && baseData.team2_id) {
            const team1SoccerData = extractSoccerScoreData(
              team1Scores, team2Scores, baseData.team1_id,
              baseData.team1_id, baseData.team2_id,
              baseData.winner_team_id, activePeriods
            );
            
            Object.assign(baseData, {
              soccer_data: team1SoccerData
            });
          }
        }
      } catch (error) {
        console.warn(`[BRACKET_API] Failed to parse multi-sport data for match ${baseData.match_id}:`, error);
        // エラーの場合は基本データのみ使用
      }

      return baseData;
    });

    return NextResponse.json({
      success: true,
      data: bracketData,
      // 多競技対応：スポーツ設定を追加
      sport_config: sportConfig,
      // パターン判定用のチーム数
      target_team_count: targetTeamCount
    });

  } catch (error) {
    console.error('Error fetching tournament bracket:', error);
    return NextResponse.json(
      { success: false, error: `データの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}