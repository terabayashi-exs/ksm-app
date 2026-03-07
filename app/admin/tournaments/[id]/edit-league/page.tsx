import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentEditLeagueForm from "@/components/features/tournament/TournamentEditLeagueForm";

interface EditLeaguePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditLeagueTournamentPage({ params }: EditLeaguePageProps) {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const resolvedParams = await params;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">リーグ戦 部門編集</h1>
            <p className="text-sm text-white/70 mt-1">
              リーグ戦部門の基本情報を編集します
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>リーグ戦 部門編集</CardTitle>
            <p className="text-sm text-muted-foreground">
              部門の基本情報を編集できます。節ごとの会場・日程は「節設定」画面から設定してください。
            </p>
          </CardHeader>
          <CardContent>
            <TournamentEditLeagueForm tournamentId={resolvedParams.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
