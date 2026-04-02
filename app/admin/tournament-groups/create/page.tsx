export const metadata = { title: "大会作成" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronRight, Home } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TournamentGroupCreateForm from "@/components/features/tournament/TournamentGroupCreateForm";
import { getCurrentSubscriptionInfo } from "@/lib/subscription/subscription-service";

export default async function CreateTournamentGroupPage() {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  // サブスクリプション情報を取得
  const subscriptionInfo = await getCurrentSubscriptionInfo(session.user.id);
  const canCreateTournament = subscriptionInfo?.canCreateTournament ?? true;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            大会作成
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">大会作成</h1>
          <p className="text-sm text-gray-500 mt-1">
            新しい大会を作成します。作成後、部門を追加できます。
          </p>
        </div>
        {!canCreateTournament ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>大会作成上限に達しています</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-4">
                現在のプランでは大会の作成上限に達しています。新しい大会を作成するには、プランをアップグレードしてください。
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href="/admin/subscription/plans">
                    プランをアップグレード
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/my">
                    ダッシュボードに戻る
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <TournamentGroupCreateForm />
        )}
      </div>
    </div>
  );
}
