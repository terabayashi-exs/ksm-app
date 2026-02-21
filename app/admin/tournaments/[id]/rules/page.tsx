import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import TournamentRulesForm from "@/components/features/tournament-rules/TournamentRulesForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentRulesPage({ params }: Props) {
  const resolvedParams = await params;
  const session = await auth();
  
  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">大会ルール設定</h1>
              <p className="text-sm text-muted-foreground mt-1">
                競技ルールの詳細設定を行います
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/my?tab=admin">
                ダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentRulesForm tournamentId={parseInt(resolvedParams.id)} />
      </div>
    </div>
  );
}