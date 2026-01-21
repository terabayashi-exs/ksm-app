// app/api/tournaments/[id]/draw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック（管理者のみ）
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { blocks } = body;

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { success: false, error: 'ブロック情報が不正です' },
        { status: 400 }
      );
    }

    try {
      // 既存の振分情報をクリア
      await db.execute(`
        UPDATE t_tournament_teams 
        SET assigned_block = NULL, block_position = NULL 
        WHERE tournament_id = ?
      `, [tournamentId]);

      // 新しい振分情報を保存（tournament_team_idを使用して特定のエントリーのみ更新）
      for (const block of blocks) {
        for (const team of block.teams) {
          await db.execute(`
            UPDATE t_tournament_teams
            SET assigned_block = ?, block_position = ?
            WHERE tournament_team_id = ?
          `, [
            block.block_name,
            team.block_position,
            team.tournament_team_id
          ]);
        }
      }

      // 試合データを更新（team1_id, team2_idに実際のチームIDを設定）
      const matchesResult = await db.execute(`
        SELECT ml.match_id, ml.team1_display_name, ml.team2_display_name, ml.match_block_id,
               mb.block_name, mb.phase
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'preliminary'
      `, [tournamentId]);

      // 各試合について、表示名に対応する実際のチームIDと実際のチーム名を設定
      for (const match of matchesResult.rows) {
        const blockName = match.block_name as string;
        const team1DisplayName = match.team1_display_name as string;
        const team2DisplayName = match.team2_display_name as string;

        // "A1チーム" -> ブロックA、1番目のチーム
        const team1Data = await getTeamDataByPosition(tournamentId, blockName, team1DisplayName);
        const team2Data = await getTeamDataByPosition(tournamentId, blockName, team2DisplayName);

        // 両方のチームが存在する場合
        if (team1Data && team2Data) {
          // display_nameはプレースホルダー形式のまま維持
          // UIではtournament_team_idを使って実際のチーム名を表示する
          await db.execute(`
            UPDATE t_matches_live
            SET team1_id = ?,
                team2_id = ?,
                team1_tournament_team_id = ?,
                team2_tournament_team_id = ?
            WHERE match_id = ?
          `, [
            team1Data.team_id,
            team2Data.team_id,
            team1Data.tournament_team_id,
            team2Data.tournament_team_id,
            match.match_id
          ]);
        }
        // 不戦勝試合：team1のみ存在する場合
        else if (team1Data && !team2Data) {
          await db.execute(`
            UPDATE t_matches_live
            SET team1_id = ?,
                team1_tournament_team_id = ?,
                team2_id = NULL,
                team2_tournament_team_id = NULL
            WHERE match_id = ?
          `, [
            team1Data.team_id,
            team1Data.tournament_team_id,
            match.match_id
          ]);
        }
        // 不戦勝試合：team2のみ存在する場合
        else if (!team1Data && team2Data) {
          await db.execute(`
            UPDATE t_matches_live
            SET team1_id = NULL,
                team1_tournament_team_id = NULL,
                team2_id = ?,
                team2_tournament_team_id = ?
            WHERE match_id = ?
          `, [
            team2Data.team_id,
            team2Data.tournament_team_id,
            match.match_id
          ]);
        }
      }

      return NextResponse.json({
        success: true,
        message: '組合せが正常に保存されました'
      });

    } catch (error) {
      console.error('組合せ保存処理エラー:', error);
      throw error;
    }

  } catch (error) {
    console.error('組合せ保存エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '組合せの保存に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 表示名からチームデータ（team_id, tournament_team_id, team_name）を取得する関数
async function getTeamDataByPosition(
  tournamentId: number,
  blockName: string,
  displayName: string
): Promise<{ team_id: string; tournament_team_id: number; team_name: string } | null> {
  // "A1チーム" -> ブロックA、1番目のチーム
  const match = displayName.match(/^([A-Z])(\d+)チーム$/);
  if (!match) return null;

  const [, expectedBlockName, position] = match;
  if (expectedBlockName !== blockName) return null;

  const positionNum = parseInt(position);

  const result = await db.execute(`
    SELECT
      team_id,
      tournament_team_id,
      COALESCE(team_omission, team_name) as team_name
    FROM t_tournament_teams
    WHERE tournament_id = ? AND assigned_block = ? AND block_position = ?
  `, [tournamentId, blockName, positionNum]);

  if (result.rows.length === 0) return null;

  return {
    team_id: result.rows[0].team_id as string,
    tournament_team_id: result.rows[0].tournament_team_id as number,
    team_name: result.rows[0].team_name as string
  };
}