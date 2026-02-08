// app/api/tournaments/[id]/draw/route.ts
// MIGRATION NOTE: team_id → tournament_team_id 移行済み (2026-02-04)
// 組み合わせ抽選時にはteam1_id/team2_idを設定せず、tournament_team_idのみを使用
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * 不戦勝試合（片方のチームのみ設定）を自動確定する
 * 組合せ作成時に実行
 */
async function autoConfirmWalkoverMatches(tournamentId: number): Promise<void> {
  try {
    console.log(`[AUTO_CONFIRM_WALKOVER] Checking for walkover matches in tournament ${tournamentId}`);

    // 不戦勝試合を検索（tournament_team_id XOR が設定されている試合、かつ未確定）
    // MIGRATION NOTE: team_id条件からtournament_team_id条件に変更
    const walkoverMatchesResult = await db.execute(`
      SELECT
        ml.match_id,
        ml.match_code,
        ml.match_number,
        ml.match_block_id,
        ml.team1_tournament_team_id,
        ml.team2_tournament_team_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        ml.start_time,
        ml.tournament_date
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      WHERE mb.tournament_id = ?
        AND mf.match_id IS NULL
        AND (
          (ml.team1_tournament_team_id IS NOT NULL AND ml.team2_tournament_team_id IS NULL)
          OR (ml.team1_tournament_team_id IS NULL AND ml.team2_tournament_team_id IS NOT NULL)
        )
    `, [tournamentId]);

    if (walkoverMatchesResult.rows.length === 0) {
      console.log(`[AUTO_CONFIRM_WALKOVER] No walkover matches found`);
      return;
    }

    console.log(`[AUTO_CONFIRM_WALKOVER] Found ${walkoverMatchesResult.rows.length} walkover matches to auto-confirm`);

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    for (const match of walkoverMatchesResult.rows) {
      const matchId = match.match_id as number;
      const matchCode = match.match_code as string;
      const team1TournamentTeamId = match.team1_tournament_team_id as number | null;
      const team2TournamentTeamId = match.team2_tournament_team_id as number | null;

      // 勝者を決定（設定されているチーム）
      // MIGRATION NOTE: tournament_team_idベースで判定
      const winnerTournamentTeamId = team1TournamentTeamId || team2TournamentTeamId;

      // t_matches_finalに登録
      await db.execute(`
        INSERT INTO t_matches_final (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_tournament_team_id, team2_tournament_team_id,
          team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, winner_tournament_team_id,
          is_draw, is_walkover, remarks, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        matchId,
        match.match_block_id,
        match.tournament_date,
        match.match_number,
        matchCode,
        match.team1_tournament_team_id,
        match.team2_tournament_team_id,
        match.team1_display_name,
        match.team2_display_name,
        match.court_number,
        match.start_time,
        '0', // team1_scores
        '0', // team2_scores
        winnerTournamentTeamId,
        0, // is_draw
        1, // is_walkover
        '不戦勝により自動確定', // remarks
        now,
        now
      ]);

      console.log(`[AUTO_CONFIRM_WALKOVER] ✅ Auto-confirmed walkover match ${matchCode} (ID: ${matchId}), winner_tt_id: ${winnerTournamentTeamId}`);

      // 不戦勝試合の進出処理も実行
      try {
        const { updateTournamentProgression } = await import('@/lib/tournament-progression');
        await updateTournamentProgression(matchCode, null, null, tournamentId, winnerTournamentTeamId, null);
        console.log(`[AUTO_CONFIRM_WALKOVER] ✅ Processed progression for walkover match ${matchCode}`);
      } catch (progressionError) {
        console.error(`[AUTO_CONFIRM_WALKOVER] Failed to process progression for ${matchCode}:`, progressionError);
      }
    }

    console.log(`[AUTO_CONFIRM_WALKOVER] ✅ Completed auto-confirmation of ${walkoverMatchesResult.rows.length} walkover matches`);

  } catch (error) {
    console.error(`[AUTO_CONFIRM_WALKOVER] Error auto-confirming walkover matches:`, error);
    // エラーが発生してもメインの処理は継続（組合せ保存は成功扱い）
  }
}

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
      // 既存の不戦勝確定データを削除（振分け直しに対応）
      await db.execute(`
        DELETE FROM t_matches_final
        WHERE match_id IN (
          SELECT mf.match_id
          FROM t_matches_final mf
          INNER JOIN t_match_blocks mb ON mf.match_block_id = mb.match_block_id
          WHERE mb.tournament_id = ? AND mf.is_walkover = 1
        )
      `, [tournamentId]);
      console.log('[Draw Save API] Cleared existing walkover confirmations');

      // 既存の振分情報をクリア
      await db.execute(`
        UPDATE t_tournament_teams
        SET assigned_block = NULL, block_position = NULL
        WHERE tournament_id = ?
      `, [tournamentId]);

      // 新しい振分情報を保存（tournament_team_idを使用して特定のエントリーのみ更新）
      for (const block of blocks) {
        // 重複チェック用のSet
        const usedPositions = new Set<number>();

        for (const team of block.teams) {
          // block_positionの重複チェック
          if (usedPositions.has(team.block_position)) {
            console.error(`[Draw Save API] ⚠️ Duplicate block_position detected: ${block.block_name} position ${team.block_position}`);
            return NextResponse.json(
              {
                success: false,
                error: `${block.block_name}ブロックの位置${team.block_position}に複数のチームが割り当てられています。組合せを確認してください。`
              },
              { status: 400 }
            );
          }
          usedPositions.add(team.block_position);

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

      // フロントエンドからmatches情報を使用してチーム割当を更新
      if (frontendMatches && Array.isArray(frontendMatches) && frontendMatches.length > 0) {
        console.log('[Draw Save API] Using frontend matches data');

        for (const match of frontendMatches) {
          console.log(`[Draw Save API] Updating match ${match.match_id}: team1_tt_id=${match.team1_tournament_team_id}, team2_tt_id=${match.team2_tournament_team_id}`);

          // team1とteam2の両方が存在する場合
          // MIGRATION NOTE: team_id系フィールドは設定しない（tournament_team_idのみ使用）
          if (match.team1_tournament_team_id && match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_tournament_team_id = ?,
                  team2_tournament_team_id = ?
              WHERE match_id = ?
            `, [
              match.team1_tournament_team_id,
              match.team2_tournament_team_id,
              match.match_id
            ]);
          }
          // BYE試合：team1のみ
          // MIGRATION NOTE: team_id系フィールドは設定しない（tournament_team_idのみ使用）
          else if (match.team1_tournament_team_id && !match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_tournament_team_id = ?,
                  team2_tournament_team_id = NULL
              WHERE match_id = ?
            `, [
              match.team1_tournament_team_id,
              match.match_id
            ]);
          }
          // BYE試合：team2のみ
          // MIGRATION NOTE: team_id系フィールドは設定しない（tournament_team_idのみ使用）
          else if (!match.team1_tournament_team_id && match.team2_tournament_team_id) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_tournament_team_id = NULL,
                  team2_tournament_team_id = ?
              WHERE match_id = ?
            `, [
              match.team2_tournament_team_id,
              match.match_id
            ]);
          }
        }
      }

      // リーグ戦の場合：blocks情報からtournament_team_idを試合に割り当て
      // team1_display_name/team2_display_nameのポジション番号とブロック名から
      // assigned_block/block_positionが一致するtournament_team_idを探して更新
      console.log('[Draw Save API] Updating league match assignments from block positions');

      // 全試合を取得
      const allMatchesResult = await db.execute(`
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          mb.block_name,
          mb.phase
        FROM t_matches_live ml
        JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'preliminary'
      `, [tournamentId]);

      // block_name + block_position から tournament_team_id へのマッピングを作成
      const blockPositionMap = new Map<string, number>();
      for (const block of blocks) {
        block.teams.forEach((team: { tournament_team_id: number; block_position: number }, index: number) => {
          const key = `${block.block_name}-${team.block_position || index + 1}`;
          blockPositionMap.set(key, team.tournament_team_id);
        });
      }

      console.log(`[Draw Save API] Block position map:`, Object.fromEntries(blockPositionMap));

      // team1_display_name/team2_display_nameから position を抽出する関数
      const extractPosition = (displayName: string): number | null => {
        // "A1チーム", "A2チーム" などから数字を抽出
        const match = displayName?.match(/([A-Za-z]+)(\d+)チーム$/);
        return match ? parseInt(match[2]) : null;
      };

      // 各試合のtournament_team_idを更新
      for (const match of allMatchesResult.rows) {
        const matchId = match.match_id as number;
        const blockName = match.block_name as string;
        const team1Display = match.team1_display_name as string;
        const team2Display = match.team2_display_name as string;

        const team1Pos = extractPosition(team1Display);
        const team2Pos = extractPosition(team2Display);

        if (team1Pos !== null && team2Pos !== null) {
          const team1Key = `${blockName}-${team1Pos}`;
          const team2Key = `${blockName}-${team2Pos}`;

          const team1TournamentTeamId = blockPositionMap.get(team1Key);
          const team2TournamentTeamId = blockPositionMap.get(team2Key);

          if (team1TournamentTeamId && team2TournamentTeamId) {
            await db.execute(`
              UPDATE t_matches_live
              SET team1_tournament_team_id = ?,
                  team2_tournament_team_id = ?
              WHERE match_id = ?
            `, [team1TournamentTeamId, team2TournamentTeamId, matchId]);

            console.log(`[Draw Save API] Updated match ${matchId}: ${team1Display}(tt_id:${team1TournamentTeamId}) vs ${team2Display}(tt_id:${team2TournamentTeamId})`);
          }
        }
      }

      // 不戦勝試合を自動確定
      await autoConfirmWalkoverMatches(tournamentId);

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