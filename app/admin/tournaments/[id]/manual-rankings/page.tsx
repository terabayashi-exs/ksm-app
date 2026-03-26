// app/admin/tournaments/[id]/manual-rankings/page.tsx
export const metadata = { title: "順位手動調整" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import ManualRankingsEditor from "@/components/features/tournament/ManualRankingsEditor";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home } from "lucide-react";
import { buildPhaseFormatMap } from "@/lib/tournament-phases";
import { calculateBlockStandings } from "@/lib/standings-calculator";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManualRankingsPage({ params }: PageProps) {
  const session = await auth();
  
  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/login");
  }

  // Next.js 15対応：paramsは常にPromise
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  if (isNaN(tournamentId)) {
    redirect("/admin/tournaments");
  }

  // 大会情報を取得（フォーマット種別を含む）
  const tournamentResult = await db.execute({
    sql: `
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.status,
        v.venue_name,
        tf.format_name,
        t.phases
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = ?
    `,
    args: [tournamentId]
  });

  if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
    redirect("/admin/tournaments");
  }

  const tournament = {
    tournament_id: tournamentResult.rows[0].tournament_id as number,
    tournament_name: tournamentResult.rows[0].tournament_name as string,
    format_id: tournamentResult.rows[0].format_id as number,
    status: tournamentResult.rows[0].status as string,
    venue_name: tournamentResult.rows[0].venue_name as string,
    format_name: tournamentResult.rows[0].format_name as string,
    phases: tournamentResult.rows[0].phases as string | null
  };

  // ブロック情報と順位表を取得
  // phasesのformat_typeに応じてフィルタリング
  const manualPhaseFormatMap = buildPhaseFormatMap(tournament.phases);

  const allBlocksResult = await db.execute({
    sql: `
      SELECT
        mb.match_block_id,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.team_rankings,
        mb.remarks
      FROM t_match_blocks mb
      WHERE mb.tournament_id = ?
      ORDER BY mb.block_order, mb.match_block_id
    `,
    args: [tournamentId]
  });

  // format_typeに応じてブロックをフィルタリング
  const filteredBlocks = allBlocksResult.rows.filter(block => {
    const blockPhase = block.phase as string;
    const blockName = block.block_name as string;
    const formatType = manualPhaseFormatMap.get(blockPhase);
    if (formatType === 'tournament') return blockName.endsWith('_unified');
    if (formatType === 'league') return !blockName.endsWith('_unified');
    return true;
  });
  const blocksResult = { rows: filteredBlocks };

  const blocks = await Promise.all(blocksResult.rows.map(async (row) => {
    const matchBlockId = row.match_block_id as number;
    let teamRankings = row.team_rankings ? JSON.parse(row.team_rankings as string) : [];

    // team_rankingsが空の場合、試合結果から順位を計算して補完
    if (teamRankings.length === 0) {
      try {
        teamRankings = await calculateBlockStandings(matchBlockId, tournamentId);
      } catch {
        teamRankings = [];
      }
    }

    return {
      match_block_id: matchBlockId,
      phase: row.phase as string,
      display_round_name: row.actual_round_name as string,
      block_name: row.block_name as string,
      team_rankings: teamRankings,
      remarks: row.remarks as string | null
    };
  }));

  // トーナメント形式のフェーズIDを動的に取得
  const tournamentPhaseIds = Array.from(manualPhaseFormatMap.entries())
    .filter(([, formatType]) => formatType === 'tournament')
    .map(([phaseId]) => phaseId);

  // トーナメント形式フェーズの試合情報を取得
  let finalMatches: Array<{
    match_id: number;
    match_code: string;
    team1_tournament_team_id: number | null;
    team2_tournament_team_id: number | null;
    team1_display_name: string;
    team2_display_name: string;
    team1_scores: number | null;
    team2_scores: number | null;
    winner_tournament_team_id: number | null;
    is_draw: boolean;
    is_walkover: boolean;
    is_confirmed: boolean;
    match_status: string;
    start_time: string | null;
    court_number: number | null;
  }> = [];

  if (tournamentPhaseIds.length > 0) {
    const placeholders = tournamentPhaseIds.map(() => '?').join(', ');
    const finalTournamentResult = await db.execute({
      sql: `
        SELECT
          ml.match_id,
          ml.match_code,
          ml.team1_tournament_team_id,
          ml.team2_tournament_team_id,
          COALESCE(tt1.team_name, ml.team1_display_name) as team1_display_name,
          COALESCE(tt2.team_name, ml.team2_display_name) as team2_display_name,
          mf.team1_scores,
          mf.team2_scores,
          mf.winner_tournament_team_id,
          mf.is_draw,
          mf.is_walkover,
          CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
          ml.match_status,
          ml.start_time,
          ml.court_number
        FROM t_matches_live ml
        LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
        LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
        LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
        WHERE mb.tournament_id = ?
          AND mb.phase IN (${placeholders})
          AND (ml.match_type IS NULL OR ml.match_type != 'FM')
        ORDER BY ml.match_number, ml.match_code
      `,
      args: [tournamentId, ...tournamentPhaseIds]
    });

    finalMatches = finalTournamentResult.rows.map(row => ({
      match_id: row.match_id as number,
      match_code: row.match_code as string,
      team1_tournament_team_id: row.team1_tournament_team_id as number | null,
      team2_tournament_team_id: row.team2_tournament_team_id as number | null,
      team1_display_name: row.team1_display_name as string,
      team2_display_name: row.team2_display_name as string,
      team1_scores: row.team1_scores as number | null,
      team2_scores: row.team2_scores as number | null,
      winner_tournament_team_id: row.winner_tournament_team_id as number | null,
      is_draw: Boolean(row.is_draw),
      is_walkover: Boolean(row.is_walkover),
      is_confirmed: Boolean(row.is_confirmed),
      match_status: row.match_status as string,
      start_time: row.start_time as string | null,
      court_number: row.court_number as number | null
    }));
  }

  // トーナメント形式フェーズの順位データを取得（_unifiedブロックから）
  let finalRankings = null;
  if (tournamentPhaseIds.length > 0) {
    const placeholders = tournamentPhaseIds.map(() => '?').join(', ');
    const finalBlockResult = await db.execute({
      sql: `
        SELECT
          match_block_id,
          team_rankings,
          remarks
        FROM t_match_blocks
        WHERE tournament_id = ?
          AND phase IN (${placeholders})
          AND block_name LIKE '%_unified'
        LIMIT 1
      `,
      args: [tournamentId, ...tournamentPhaseIds]
    });

    if (finalBlockResult.rows.length > 0) {
      const finalBlock = finalBlockResult.rows[0];
      finalRankings = {
        match_block_id: finalBlock.match_block_id as number,
        team_rankings: finalBlock.team_rankings ? JSON.parse(finalBlock.team_rankings as string) : [],
        remarks: finalBlock.remarks as string | null
      };
    }
  }

  // 進出条件を取得（t_matches_liveのteam1_source/team2_sourceから判定）
  // オーバーライドも考慮
  const promotionRequirementsResult = await db.execute({
    sql: `
      SELECT DISTINCT
        COALESCE(tmo.team1_source_override, ml.team1_source) as team1_source,
        COALESCE(tmo.team2_source_override, ml.team2_source) as team2_source
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_match_overrides tmo
        ON ml.match_code = tmo.match_code
        AND tmo.tournament_id = ?
      WHERE mb.tournament_id = ?
        AND (ml.team1_source IS NOT NULL OR ml.team2_source IS NOT NULL)
        AND (ml.team1_source LIKE '%_%' OR ml.team2_source LIKE '%_%')
    `,
    args: [tournamentId, tournamentId]
  });

  const promotionRequirements = promotionRequirementsResult.rows.flatMap(row => {
    const sources = [];
    if (row.team1_source) sources.push(String(row.team1_source));
    if (row.team2_source) sources.push(String(row.team2_source));
    return sources;
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">手動順位設定</h1>
            <p className="text-sm text-white/70 mt-1">
              各ブロックの順位を手動で調整できます。同順位も設定可能です。
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            順位手動調整
          </span>
        </nav>
        <ManualRankingsEditor
          tournamentId={tournamentId}
          blocks={blocks}
          phases={tournament.phases}
          finalMatches={finalMatches}
          finalRankings={finalRankings}
          promotionRequirements={promotionRequirements}
        />
      </div>
    </div>
  );
}