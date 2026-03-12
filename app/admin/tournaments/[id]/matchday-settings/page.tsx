import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import MatchdaySettingsForm from "@/components/features/tournament/MatchdaySettingsForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MatchdaySettingsPage({ params }: PageProps) {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-3xl font-bold text-white">日程・会場設定</h1>
              <p className="text-sm text-white/70 mt-1">
                各節の会場・コート・日程・開始時刻を設定します
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>
        <MatchdaySettingsForm tournamentId={tournamentId} />
      </div>
    </div>
  );
}
