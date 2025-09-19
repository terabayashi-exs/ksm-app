// app/api/tournaments/[id]/standings-enhanced/route.ts
// 多競技対応の拡張順位表API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { 
  calculateMultiSportBlockStandings,
  MultiSportTeamStanding 
} from '@/lib/standings-calculator';
import { getSportScoreConfig, getTournamentSportCode } from '@/lib/sport-standings-calculator';

interface EnhancedBlockStanding {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  teams: MultiSportTeamStanding[];
  remarks?: string | null;
  sport_config: { sport_code: string; score_label: string; score_against_label: string; difference_label: string; supports_pk: boolean };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id, 10);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 競技種別を取得
    const sportCode = await getTournamentSportCode(tournamentId);
    const sportConfig = getSportScoreConfig(sportCode);

    console.log(`[ENHANCED_STANDINGS] Tournament ${tournamentId} - Sport: ${sportCode}`);

    // ブロック情報を取得（team_rankingsは使わずリアルタイム計算）
    const blocks = await db.execute({
      sql: `
        SELECT 
          mb.match_block_id,
          mb.phase,
          mb.display_round_name,
          mb.block_name,
          mb.remarks,
          CASE 
            WHEN mb.phase = 'preliminary' THEN 1
            WHEN mb.phase = 'final' THEN 2
            ELSE 3
          END as phase_order,
          -- 予選ブロックの場合は最小match_codeで順序決定
          (
            SELECT MIN(ml.match_code)
            FROM t_matches_live ml 
            WHERE ml.match_block_id = mb.match_block_id
          ) as min_match_code
        FROM t_match_blocks mb
        WHERE mb.tournament_id = ?
        ORDER BY 
          phase_order,
          CASE 
            WHEN mb.phase = 'preliminary' THEN min_match_code
            ELSE mb.match_block_id
          END
      `,
      args: [tournamentId]
    });

    const enhancedStandings: EnhancedBlockStanding[] = [];

    for (const block of blocks.rows) {
      const matchBlockId = block.match_block_id as number;
      
      try {
        // 多競技対応で動的に順位計算
        const multiSportTeams = await calculateMultiSportBlockStandings(matchBlockId, tournamentId);
        
        enhancedStandings.push({
          match_block_id: matchBlockId,
          phase: block.phase as string,
          display_round_name: block.display_round_name as string,
          block_name: block.block_name as string,
          teams: multiSportTeams,
          remarks: block.remarks as string | null,
          sport_config: sportConfig
        });
      } catch (error) {
        console.error(`[ENHANCED_STANDINGS] Block ${matchBlockId} calculation failed:`, error);
        
        // エラー時は空のチーム配列で継続
        enhancedStandings.push({
          match_block_id: matchBlockId,
          phase: block.phase as string,
          display_round_name: block.display_round_name as string,
          block_name: block.block_name as string,
          teams: [],
          remarks: block.remarks as string | null,
          sport_config: sportConfig
        });
      }
    }

    // 確定済み試合数を正確に計算（戦績表と同じロジック）
    const totalMatchesResult = await db.execute({
      sql: `
        SELECT COUNT(*) as total_matches
        FROM t_matches_final mf
        JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
      `,
      args: [tournamentId]
    });

    const totalMatches = totalMatchesResult.rows[0]?.total_matches as number || 0;

    // 参加チーム数を計算
    const totalTeamsResult = await db.execute({
      sql: `
        SELECT COUNT(DISTINCT tt.team_id) as total_teams
        FROM t_tournament_teams tt
        WHERE tt.tournament_id = ? 
        AND tt.withdrawal_status != 'withdrawal_approved'
      `,
      args: [tournamentId]
    });

    const totalTeams = totalTeamsResult.rows[0]?.total_teams as number || 0;

    return NextResponse.json({
      success: true,
      data: enhancedStandings,
      sport_config: sportConfig,
      total_matches: totalMatches,
      total_teams: totalTeams,
      message: '拡張順位表を正常に取得しました'
    });

  } catch (error) {
    console.error('[ENHANCED_STANDINGS] API エラー:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: '拡張順位表の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}