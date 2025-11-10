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
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  // Next.js 15対応：paramsは常にPromise
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  if (isNaN(tournamentId)) {
    redirect("/admin/tournaments");
  }

  // 大会情報を取得
  const tournamentResult = await db.execute({
    sql: `
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.status,
        v.venue_name,
        tf.format_name
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
    status: tournamentResult.rows[0].status as string,
    venue_name: tournamentResult.rows[0].venue_name as string,
    format_name: tournamentResult.rows[0].format_name as string
  };

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

  // 決勝トーナメントの試合情報を取得
  const finalTournamentResult = await db.execute({
    sql: `
      SELECT 
        ml.match_id,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
        COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as is_confirmed,
        ml.match_status,
        ml.start_time,
        ml.court_number
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      WHERE mb.tournament_id = ? 
        AND mb.phase = 'final'
      ORDER BY ml.match_number, ml.match_code
    `,
    args: [tournamentId]
  });

  const finalMatches = finalTournamentResult.rows.map(row => ({
    match_id: row.match_id as number,
    match_code: row.match_code as string,
    team1_id: row.team1_id as string | null,
    team2_id: row.team2_id as string | null,
    team1_display_name: row.team1_display_name as string,
    team2_display_name: row.team2_display_name as string,
    team1_scores: row.team1_scores as number | null,
    team2_scores: row.team2_scores as number | null,
    winner_team_id: row.winner_team_id as string | null,
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
          finalMatches={finalMatches}
          finalRankings={finalRankings}
        />
      </div>
    </div>
  );
}