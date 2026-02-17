// app/admin/tournaments/[id]/manual-rankings/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import ManualRankingsEditor from "@/components/features/tournament/ManualRankingsEditor";

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
        tf.preliminary_format_type,
        tf.final_format_type
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
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
    preliminary_format_type: tournamentResult.rows[0].preliminary_format_type as string,
    final_format_type: tournamentResult.rows[0].final_format_type as string
  };

  // ブロック情報と順位表を取得
  // トーナメント形式：統合ブロック（block_name = 'preliminary_unified' or 'final_unified'）
  // リーグ形式：個別ブロック（block_name != '*_unified'）
  const blocksResult = await db.execute({
    sql: `
      SELECT
        mb.match_block_id,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.team_rankings,
        mb.remarks
      FROM t_match_blocks mb
      WHERE mb.tournament_id = ?
        AND (
          (mb.phase = 'preliminary' AND ? = 'tournament' AND mb.block_name = 'preliminary_unified')
          OR (mb.phase = 'preliminary' AND ? = 'league' AND mb.block_name != 'preliminary_unified')
          OR (mb.phase = 'final' AND ? = 'tournament' AND mb.block_name = 'final_unified')
          OR (mb.phase = 'final' AND ? = 'league' AND mb.block_name != 'final_unified')
        )
      ORDER BY
        CASE mb.phase WHEN 'preliminary' THEN 1 WHEN 'final' THEN 2 ELSE 3 END,
        mb.block_order,
        mb.match_block_id
    `,
    args: [tournamentId, tournament.preliminary_format_type, tournament.preliminary_format_type, tournament.final_format_type, tournament.final_format_type]
  });

  const blocks = blocksResult.rows.map(row => ({
    match_block_id: row.match_block_id as number,
    phase: row.phase as string,
    display_round_name: row.actual_round_name as string,
    block_name: row.block_name as string,
    team_rankings: row.team_rankings ? JSON.parse(row.team_rankings as string) : [],
    remarks: row.remarks as string | null
  }));

  // 決勝トーナメントの試合情報を取得
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
        AND mb.phase = 'final'
      ORDER BY ml.match_number, ml.match_code
    `,
    args: [tournamentId]
  });

  const finalMatches = finalTournamentResult.rows.map(row => ({
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

  // 決勝トーナメントの順位データを取得
  const finalBlockResult = await db.execute({
    sql: `
      SELECT 
        match_block_id,
        team_rankings,
        remarks
      FROM t_match_blocks 
      WHERE tournament_id = ? 
      AND phase = 'final'
      LIMIT 1
    `,
    args: [tournamentId]
  });

  let finalRankings = null;
  if (finalBlockResult.rows.length > 0) {
    const finalBlock = finalBlockResult.rows[0];
    finalRankings = {
      match_block_id: finalBlock.match_block_id as number,
      team_rankings: finalBlock.team_rankings ? JSON.parse(finalBlock.team_rankings as string) : [],
      remarks: finalBlock.remarks as string | null
    };

    console.log(`[MANUAL_RANKINGS_PAGE] 決勝トーナメント順位取得: ${finalRankings.team_rankings.length}チーム`);
  }

  // 決勝進出条件を取得（team1_source, team2_sourceから必要な順位を判定）
  // テンプレートとオーバーライドの両方を考慮
  const promotionRequirementsResult = await db.execute({
    sql: `
      SELECT DISTINCT
        COALESCE(tmo.team1_source_override, mt.team1_source) as team1_source,
        COALESCE(tmo.team2_source_override, mt.team2_source) as team2_source
      FROM m_match_templates mt
      LEFT JOIN t_tournament_match_overrides tmo
        ON mt.match_code = tmo.match_code
        AND tmo.tournament_id = ?
      WHERE mt.format_id = ?
        AND mt.phase = 'final'
        AND (mt.team1_source IS NOT NULL OR mt.team2_source IS NOT NULL)
    `,
    args: [tournamentId, tournament.format_id]
  });

  const promotionRequirements = promotionRequirementsResult.rows.flatMap(row => {
    const sources = [];
    if (row.team1_source) sources.push(String(row.team1_source));
    if (row.team2_source) sources.push(String(row.team2_source));
    return sources;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-foreground">手動順位設定</h1>
              <span className="text-sm text-muted-foreground">
                {tournament.tournament_name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              各ブロックの順位を手動で調整できます。同着順位も設定可能です。
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ManualRankingsEditor
          tournamentId={tournamentId}
          blocks={blocks}
          preliminaryFormatType={tournament.preliminary_format_type}
          finalFormatType={tournament.final_format_type}
          finalMatches={finalMatches}
          finalRankings={finalRankings}
          promotionRequirements={promotionRequirements}
        />
      </div>
    </div>
  );
}