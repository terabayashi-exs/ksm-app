import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-3xl font-bold text-white">大会ルール設定</h1>
              <p className="text-sm text-white/70 mt-1">
                競技ルールの詳細設定を行います
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my?tab=admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>
        <TournamentRulesForm tournamentId={parseInt(resolvedParams.id)} />
      </div>
    </div>
  );
}