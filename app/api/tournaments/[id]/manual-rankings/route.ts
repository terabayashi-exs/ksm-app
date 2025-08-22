// app/api/tournaments/[id]/manual-rankings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { promoteTeamsToFinalTournament } from '@/lib/tournament-promotion';
import { autoResolveManualRankingNotifications } from '@/lib/notifications';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TeamRanking {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

interface BlockUpdate {
  match_block_id: number;
  team_rankings: TeamRanking[];
  remarks?: string;
}

interface FinalTournamentUpdate {
  team_rankings: {
    team_id: string;
    team_name: string;
    position: number;
    is_confirmed: boolean;
  }[];
  remarks?: string;
}

// 手動順位の更新
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    console.log('[MANUAL_RANKINGS] 手動順位更新開始');
    
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // Next.js 15対応：paramsは常にPromise
    const resolvedParams = await params;

    const tournamentId = parseInt(resolvedParams.id);
    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // リクエストボディの取得
    const body = await request.json();
    const { blocks, finalTournament }: { 
      blocks: BlockUpdate[]; 
      finalTournament?: FinalTournamentUpdate | null;
    } = body;

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { success: false, error: 'ブロックデータが不正です' },
        { status: 400 }
      );
    }

    console.log(`[MANUAL_RANKINGS] ${blocks.length}ブロックの順位を更新`);

    // 各ブロックの順位表を更新
    for (const block of blocks) {
      console.log(`[MANUAL_RANKINGS] ブロック ${block.match_block_id} 更新中...`);
      
      // 順位の妥当性チェック
      const positions = block.team_rankings.map(t => t.position).sort((a, b) => a - b);
      const teamCount = block.team_rankings.length;
      
      // 順位が1からteamCountの範囲内かチェック
      const invalidPositions = positions.filter(pos => pos < 1 || pos > teamCount);
      if (invalidPositions.length > 0) {
        return NextResponse.json(
          { success: false, error: `不正な順位が設定されています: ${invalidPositions.join(', ')}` },
          { status: 400 }
        );
      }

      // データベースを更新
      const updateResult = await db.execute({
        sql: `
          UPDATE t_match_blocks 
          SET team_rankings = ?, remarks = ?, updated_at = datetime('now', '+9 hours') 
          WHERE match_block_id = ?
        `,
        args: [JSON.stringify(block.team_rankings), block.remarks || null, block.match_block_id]
      });

      console.log(`[MANUAL_RANKINGS] ブロック ${block.match_block_id} 更新完了: ${updateResult.rowsAffected}行`);
    }

    // 決勝トーナメントの順位保存処理
    if (finalTournament) {
      console.log('[MANUAL_RANKINGS] 決勝トーナメント順位保存開始...');
      
      // 決勝トーナメントブロックを取得
      const finalBlockResult = await db.execute({
        sql: `
          SELECT match_block_id 
          FROM t_match_blocks 
          WHERE tournament_id = ? AND phase = 'final'
        `,
        args: [tournamentId]
      });

      if (finalBlockResult.rows.length > 0) {
        const finalBlockId = finalBlockResult.rows[0].match_block_id as number;
        
        // 順位の妥当性チェック
        const positions = finalTournament.team_rankings.map(t => t.position).sort((a, b) => a - b);
        const teamCount = finalTournament.team_rankings.length;
        
        const invalidPositions = positions.filter(pos => pos < 1 || pos > teamCount);
        if (invalidPositions.length > 0) {
          return NextResponse.json(
            { success: false, error: `決勝トーナメントで不正な順位が設定されています: ${invalidPositions.join(', ')}` },
            { status: 400 }
          );
        }

        // 決勝トーナメントブロックの順位を更新
        const finalUpdateResult = await db.execute({
          sql: `
            UPDATE t_match_blocks 
            SET team_rankings = ?, remarks = ?, updated_at = datetime('now', '+9 hours') 
            WHERE match_block_id = ?
          `,
          args: [JSON.stringify(finalTournament.team_rankings), finalTournament.remarks || null, finalBlockId]
        });

        console.log(`[MANUAL_RANKINGS] 決勝トーナメント順位更新完了: ${finalUpdateResult.rowsAffected}行`);
      } else {
        console.log('[MANUAL_RANKINGS] 決勝トーナメントブロックが見つかりません');
      }
    }

    // 決勝トーナメント進出処理をトリガー
    try {
      console.log('[MANUAL_RANKINGS] 決勝トーナメント進出処理開始...');
      await promoteTeamsToFinalTournament(tournamentId);
      console.log('[MANUAL_RANKINGS] 決勝トーナメント進出処理完了');
      
      // 進出完了後、手動順位設定通知を自動解決
      await autoResolveManualRankingNotifications(tournamentId);
      console.log('[MANUAL_RANKINGS] 通知自動解決処理完了');
    } catch (promotionError) {
      console.error('[MANUAL_RANKINGS] 進出処理エラー:', promotionError);
      // 進出処理エラーでも順位更新は成功とする
    }

    return NextResponse.json({
      success: true,
      message: '順位表を更新しました'
    });

  } catch (error) {
    console.error('[MANUAL_RANKINGS] 手動順位更新エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '順位表の更新に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// 現在の順位表を取得（GET）
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    // Next.js 15対応：paramsは常にPromise
    const resolvedParams = await params;

    const tournamentId = parseInt(resolvedParams.id);
    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // ブロック情報と順位表を取得
    const blocksResult = await db.execute({
      sql: `
        SELECT 
          match_block_id,
          phase,
          display_round_name,
          block_name,
          team_rankings,
          remarks
        FROM t_match_blocks 
        WHERE tournament_id = ? 
        AND phase = 'preliminary'
        ORDER BY block_order, match_block_id
      `,
      args: [tournamentId]
    });

    const blocks = blocksResult.rows.map(row => ({
      match_block_id: row.match_block_id as number,
      phase: row.phase as string,
      display_round_name: row.display_round_name as string,
      block_name: row.block_name as string,
      team_rankings: row.team_rankings ? JSON.parse(row.team_rankings as string) : [],
      remarks: row.remarks as string | null
    }));

    return NextResponse.json({
      success: true,
      data: blocks
    });

  } catch (error) {
    console.error('手動順位取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '順位表の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}