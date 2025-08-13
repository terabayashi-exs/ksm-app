// app/admin/tournaments/[id]/manual-rankings/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import ManualRankingsEditor from "@/components/features/tournament/ManualRankingsEditor";

interface PageProps {
  params: Promise<{ id: string }> | { id: string };
}

export default async function ManualRankingsPage({ params }: PageProps) {
  const session = await auth();
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  // Next.js 15対応：paramsがPromiseかどうかチェック
  let resolvedParams;
  if (params && typeof params.then === 'function') {
    resolvedParams = await params;
  } else {
    resolvedParams = params as { id: string };
  }

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

  const tournament = tournamentResult.rows[0];

  // ブロック情報と順位表を取得
  const blocksResult = await db.execute({
    sql: `
      SELECT 
        match_block_id,
        phase,
        display_round_name,
        block_name,
        team_rankings
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
    team_rankings: row.team_rankings ? JSON.parse(row.team_rankings as string) : []
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">手動順位設定</h1>
              <span className="text-sm text-gray-500">
                {tournament.tournament_name}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              各ブロックの順位を手動で調整できます。同着順位も設定可能です。
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ManualRankingsEditor 
          tournamentId={tournamentId}
          blocks={blocks}
        />
      </div>
    </div>
  );
}