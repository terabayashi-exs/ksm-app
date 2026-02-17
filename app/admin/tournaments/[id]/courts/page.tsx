import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import CourtSettingsForm from "@/components/features/tournament/CourtSettingsForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentCourtsPage({ params }: PageProps) {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const { id } = await params;
  const tournamentId = parseInt(id);

  // 大会情報を取得
  const tournamentResult = await db.execute({
    sql: `
      SELECT
        t.tournament_id,
        t.tournament_name
      FROM t_tournaments t
      WHERE t.tournament_id = ?
    `,
    args: [tournamentId]
  });

  if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Card className="max-w-2xl mx-auto border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-600 text-center">大会が見つかりません</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tournament = tournamentResult.rows[0];

  // 試合データから使用されているコート数の最大値を取得
  const courtCountResult = await db.execute({
    sql: `
      SELECT COALESCE(MAX(court_number), 8) as max_courts
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND ml.court_number IS NOT NULL
    `,
    args: [tournamentId]
  });

  const maxCourts = courtCountResult.rows[0]?.max_courts as number || 8;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Button asChild variant="ghost" size="sm" className="mr-4">
              <Link href="/admin">
                <ChevronLeft className="h-4 w-4 mr-1" />
                ダッシュボードに戻る
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                コート名設定
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tournament.tournament_name as string}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>コート名のカスタマイズ</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              各コート番号に対する表示名を設定できます。未設定の場合はコート番号のみが表示されます。
            </p>
          </CardHeader>
          <CardContent>
            <CourtSettingsForm
              tournamentId={tournamentId}
              maxCourts={maxCourts}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
