import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSportScoreConfig, getTournamentSportCode } from '@/lib/sport-standings-calculator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 30分前の時刻を計算（JST）
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const thirtyMinutesAgoJST = new Date(thirtyMinutesAgo.getTime() + 9 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19);

    // 競技設定を取得（修正）
    const sportCode = await getTournamentSportCode(tournamentId);
    const sportConfig = getSportScoreConfig(sportCode);
    
    // 速報対象の試合を取得
    const matchesResult = await db.execute(`
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_id,
          ml.team2_id,
          COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
          ml.court_number,
          tc.court_name,
          ml.start_time,
          ml.match_status,
          ml.updated_at,
          ml.team1_scores,
          ml.team2_scores,
          ml.winner_team_id,
          ml.is_draw,
          ml.is_walkover,
          mb.phase,
          mb.block_name,
          -- 確定済み結果があればそちらを優先
          COALESCE(mf.team1_scores, ml.team1_scores) as final_team1_scores,
          COALESCE(mf.team2_scores, ml.team2_scores) as final_team2_scores,
          COALESCE(mf.winner_team_id, ml.winner_team_id) as final_winner_team_id,
          COALESCE(mf.is_draw, ml.is_draw) as final_is_draw,
          COALESCE(mf.is_walkover, ml.is_walkover) as final_is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as has_result
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
        LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
        WHERE mb.tournament_id = ?
          AND (
            ml.match_status = 'ongoing'
            OR 
            (ml.match_status = 'completed' AND ml.updated_at >= ?)
          )
        ORDER BY 
          CASE ml.match_status 
            WHEN 'ongoing' THEN 1
            WHEN 'completed' THEN 2
            ELSE 3
          END,
          ml.updated_at DESC
        LIMIT 6
    `, [tournamentId, thirtyMinutesAgoJST]);

    // データ整形（PK戦を考慮したスコア計算）
    const formattedMatches = matchesResult.rows.map(row => {
      // スコアデータを取得（確定済み結果があればそちらを優先）
      const scoreData = row.final_team1_scores !== null ? 
        { team1_scores: row.final_team1_scores, team2_scores: row.final_team2_scores } :
        { team1_scores: row.team1_scores, team2_scores: row.team2_scores };

      // PK戦を考慮したスコア計算関数
      const calculateDisplayScore = (team1ScoreData: string | null, team2ScoreData: string | null) => {
        if (team1ScoreData === null || team2ScoreData === null) {
          return { team1Goals: null, team2Goals: null, scoreDisplay: null };
        }

        // スコアを配列に変換
        let team1Scores: number[] = [];
        let team2Scores: number[] = [];

        if (typeof team1ScoreData === 'string' && team1ScoreData.includes(',')) {
          team1Scores = team1ScoreData.split(',').map((s: string) => Number(s) || 0);
        } else {
          team1Scores = [Number(team1ScoreData) || 0];
        }

        if (typeof team2ScoreData === 'string' && team2ScoreData.includes(',')) {
          team2Scores = team2ScoreData.split(',').map((s: string) => Number(s) || 0);
        } else {
          team2Scores = [Number(team2ScoreData) || 0];
        }

        // PK戦がある場合の特別処理（5つ以上のスコア要素がある場合）
        if (sportConfig?.supports_pk && team1Scores.length >= 5 && team2Scores.length >= 5) {
          // 通常時間（最初の4要素）とPK戦（5番目以降）を分離
          const regularTotal1 = team1Scores.slice(0, 4).reduce((sum, score) => sum + score, 0);
          const regularTotal2 = team2Scores.slice(0, 4).reduce((sum, score) => sum + score, 0);
          const pkTotal1 = team1Scores.slice(4).reduce((sum, score) => sum + score, 0);
          const pkTotal2 = team2Scores.slice(4).reduce((sum, score) => sum + score, 0);

          // PK戦のスコアがある場合は分離表示
          if (pkTotal1 > 0 || pkTotal2 > 0) {
            return {
              team1Goals: regularTotal1,
              team2Goals: regularTotal2,
              scoreDisplay: `${regularTotal1} - ${regularTotal2} (PK ${pkTotal1}-${pkTotal2})`
            };
          }

          // PK戦がない場合は通常時間のスコアのみ
          return {
            team1Goals: regularTotal1,
            team2Goals: regularTotal2,
            scoreDisplay: `${regularTotal1} - ${regularTotal2}`
          };
        }

        // 通常の処理（PK戦がない場合またはサッカー以外）
        const team1Total = team1Scores.reduce((sum, score) => sum + score, 0);
        const team2Total = team2Scores.reduce((sum, score) => sum + score, 0);
        
        return {
          team1Goals: team1Total,
          team2Goals: team2Total,
          scoreDisplay: `${team1Total} - ${team2Total}`
        };
      };

      const { team1Goals, team2Goals, scoreDisplay } = calculateDisplayScore(
        scoreData.team1_scores ? String(scoreData.team1_scores) : null, 
        scoreData.team2_scores ? String(scoreData.team2_scores) : null
      );

      return {
        match_id: Number(row.match_id),
        match_code: String(row.match_code),
        team1_display_name: String(row.team1_display_name),
        team2_display_name: String(row.team2_display_name),
        team1_goals: team1Goals,
        team2_goals: team2Goals,
        score_display: scoreDisplay, // PK戦を考慮したスコア表示
        winner_team_id: row.final_winner_team_id ? String(row.final_winner_team_id) : null,
        team1_id: row.team1_id ? String(row.team1_id) : null,
        team2_id: row.team2_id ? String(row.team2_id) : null,
        is_draw: Boolean(row.final_is_draw || false),
        is_walkover: Boolean(row.final_is_walkover || false),
        match_status: String(row.match_status),
        has_result: Boolean(row.has_result || false),
        phase: String(row.phase || 'preliminary'),
        block_name: String(row.block_name || ''),
        court_number: row.court_number ? Number(row.court_number) : null,
        court_name: row.court_name ? String(row.court_name) : null,
        start_time: row.start_time ? String(row.start_time) : null,
        end_time: null, // 終了時刻は別途取得が必要な場合は追加
        updated_at: String(row.updated_at)
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedMatches
    });

  } catch (error) {
    console.error('試合速報データ取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合速報データの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}