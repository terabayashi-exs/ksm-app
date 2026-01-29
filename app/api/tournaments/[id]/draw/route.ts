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
    const { blocks, matches: frontendMatches } = body;

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { success: false, error: 'ブロック情報が不正です' },
        { status: 400 }
      );
    }

    console.log('[Draw Save API] Received blocks:', blocks.length, 'blocks');
    console.log('[Draw Save API] Received matches:', frontendMatches?.length || 0, 'matches');

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

      // フロントエンドからmatches情報が送信されている場合は、それを使用
      if (frontendMatches && Array.isArray(frontendMatches) && frontendMatches.length > 0) {
        console.log('[Draw Save API] Using frontend matches data');

        for (const match of frontendMatches) {
          console.log(`[Draw Save API] Updating match ${match.match_id}: team1_id=${match.team1_tournament_team_id}, team2_id=${match.team2_tournament_team_id}`);

          // team1とteam2の両方が存在する場合
          if (match.team1_tournament_team_id && match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_id = (SELECT team_id FROM t_tournament_teams WHERE tournament_team_id = ?),
                  team2_id = (SELECT team_id FROM t_tournament_teams WHERE tournament_team_id = ?),
                  team1_tournament_team_id = ?,
                  team2_tournament_team_id = ?
              WHERE match_id = ?
            `, [
              match.team1_tournament_team_id,
              match.team2_tournament_team_id,
              match.team1_tournament_team_id,
              match.team2_tournament_team_id,
              match.match_id
            ]);
          }
          // BYE試合：team1のみ
          else if (match.team1_tournament_team_id && !match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_id = (SELECT team_id FROM t_tournament_teams WHERE tournament_team_id = ?),
                  team1_tournament_team_id = ?,
                  team2_id = NULL,
                  team2_tournament_team_id = NULL
              WHERE match_id = ?
            `, [
              match.team1_tournament_team_id,
              match.team1_tournament_team_id,
              match.match_id
            ]);
          }
          // BYE試合：team2のみ
          else if (!match.team1_tournament_team_id && match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_id = NULL,
                  team1_tournament_team_id = NULL,
                  team2_id = (SELECT team_id FROM t_tournament_teams WHERE tournament_team_id = ?),
                  team2_tournament_team_id = ?
              WHERE match_id = ?
            `, [
              match.team2_tournament_team_id,
              match.team2_tournament_team_id,
              match.match_id
            ]);
          }
        }
      } else {
        // 従来の方法（リーグ形式など）
        console.log('[Draw Save API] Using traditional method (team position lookup)');

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

          console.log(`[Draw Save] Processing match ${match.match_id}: team1="${team1DisplayName}", team2="${team2DisplayName}", block="${blockName}"`);

          // "A1チーム" -> ブロックA、1番目のチーム
          const team1Data = await getTeamDataByPosition(tournamentId, blockName, team1DisplayName);
          const team2Data = await getTeamDataByPosition(tournamentId, blockName, team2DisplayName);

          console.log(`[Draw Save] Resolved: team1=${team1Data?.team_name || 'null'} (id=${team1Data?.tournament_team_id}), team2=${team2Data?.team_name || 'null'} (id=${team2Data?.tournament_team_id})`);

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
  // "A1チーム", "S1チーム", "Ep1チーム" などから位置番号を抽出
  // 末尾の「チーム」を除去
  if (!displayName.endsWith('チーム')) return null;

  const withoutSuffix = displayName.slice(0, -2); // "チーム"を除去

  // ブロック名のプレフィックスを除去して位置番号を抽出
  // 例: blockName="T", displayName="S1チーム" -> "S1" -> ブロック名を除去 -> "1"
  // 例: blockName="T", displayName="T1チーム" -> "T1" -> ブロック名を除去 -> "1"
  // 例: blockName="A", displayName="A1チーム" -> "A1" -> ブロック名を除去 -> "1"

  // パターン1: ブロック名 + 数字（例: "T1", "A1"）
  const pattern1 = new RegExp(`^${blockName}(\\d+)$`);
  const match1 = withoutSuffix.match(pattern1);
  if (match1) {
    const positionNum = parseInt(match1[1]);
    return await fetchTeamByPosition(tournamentId, blockName, positionNum);
  }

  // パターン2: 任意の文字列 + 数字（例: "S1", "Ep1"）
  // ブロック名と一致しない場合も、最後の数字を位置として扱う
  const pattern2 = /^[A-Za-z]+(\d+)$/;
  const match2 = withoutSuffix.match(pattern2);
  if (match2) {
    const positionNum = parseInt(match2[1]);
    return await fetchTeamByPosition(tournamentId, blockName, positionNum);
  }

  return null;
}

// 実際にデータベースからチームデータを取得するヘルパー関数
async function fetchTeamByPosition(
  tournamentId: number,
  blockName: string,
  positionNum: number
): Promise<{ team_id: string; tournament_team_id: number; team_name: string } | null> {
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