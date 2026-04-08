// app/api/tournaments/[id]/block-team-counts/route.ts
// 各ブロックの想定チーム数を試合テンプレートから計算して返すAPI

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface BlockTeamCount {
  block_name: string;
  expected_team_count: number;
  match_count: number;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "認証が必要です" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    // 大会存在確認 + phases取得
    const tournamentResult = await db.execute(
      `
      SELECT tournament_id, phases FROM t_tournaments WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: "大会が見つかりません" }, { status: 404 });
    }

    // phasesからorder:1（最初のフェーズ）のIDを取得
    const tournament = tournamentResult.rows[0];
    let firstPhaseId: string | null = null;
    try {
      const phasesStr = tournament.phases;
      if (phasesStr) {
        const phasesData = typeof phasesStr === "string" ? JSON.parse(phasesStr) : phasesStr;
        if (phasesData?.phases?.length > 0) {
          const sorted = [...phasesData.phases].sort(
            (a: { order: number }, b: { order: number }) => a.order - b.order,
          );
          firstPhaseId = sorted[0].id;
        }
      }
    } catch (e) {
      console.warn("phases解析失敗:", e);
    }

    // フォールバック: phasesがない場合はmb.phaseを使ってフェーズ一覧から最初を取得
    if (!firstPhaseId) {
      const phaseResult = await db.execute(
        `
        SELECT DISTINCT mb.phase FROM t_match_blocks mb
        WHERE mb.tournament_id = ?
        ORDER BY mb.block_order ASC
        LIMIT 1
      `,
        [tournamentId],
      );
      if (phaseResult.rows.length > 0) {
        firstPhaseId = String(phaseResult.rows[0].phase);
      }
    }

    if (!firstPhaseId) {
      return NextResponse.json({
        success: true,
        data: { tournament_id: tournamentId, block_team_counts: [] },
      });
    }

    // 最初のフェーズの第1ラウンド（元チームのみ）の試合を取得して想定チーム数を計算
    const firstRoundResult = await db.execute(
      `
      SELECT
        ml.block_name,
        ml.team1_display_name,
        ml.team2_display_name
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
        AND mb.phase = ?
        AND ml.block_name IS NOT NULL
        AND (ml.team1_source IS NULL OR ml.team1_source = '')
        AND (ml.team2_source IS NULL OR ml.team2_source = '')
      ORDER BY ml.block_name, ml.match_number
    `,
      [tournamentId, firstPhaseId],
    );

    // ブロック別の総試合数も取得（表示用）
    const matchCountResult = await db.execute(
      `
      SELECT
        ml.block_name,
        COUNT(*) as match_count
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND mb.phase = ? AND ml.block_name IS NOT NULL
      GROUP BY ml.block_name
    `,
      [tournamentId, firstPhaseId],
    );

    // ブロック別のチームプレースホルダーを集計
    const blockTeamSets = new Map<string, Set<string>>();
    const blockMatchCounts = new Map<string, number>();

    // 試合数を設定
    matchCountResult.rows.forEach((row) => {
      blockMatchCounts.set(String(row.block_name), Number(row.match_count));
    });

    // 第1ラウンドの試合からプレースホルダーを収集
    firstRoundResult.rows.forEach((row) => {
      const blockName = String(row.block_name);
      if (!blockTeamSets.has(blockName)) {
        blockTeamSets.set(blockName, new Set());
      }
      const teamSet = blockTeamSets.get(blockName)!;

      // team1_display_nameを追加（空文字列でない場合）
      if (row.team1_display_name && String(row.team1_display_name).trim() !== "") {
        teamSet.add(String(row.team1_display_name));
      }
      // team2_display_nameを追加（空文字列でない場合）
      if (row.team2_display_name && String(row.team2_display_name).trim() !== "") {
        teamSet.add(String(row.team2_display_name));
      }
    });

    // 各ブロックの想定チーム数を計算
    const blockTeamCounts: BlockTeamCount[] = Array.from(blockTeamSets.entries())
      .map(([blockName, teamSet]) => ({
        block_name: blockName,
        expected_team_count: teamSet.size,
        match_count: blockMatchCounts.get(blockName) || 0,
      }))
      .sort((a, b) => a.block_name.localeCompare(b.block_name));

    return NextResponse.json({
      success: true,
      data: {
        tournament_id: tournamentId,
        block_team_counts: blockTeamCounts,
      },
    });
  } catch (error) {
    console.error("ブロック別チーム数取得エラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "ブロック別チーム数の取得に失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
