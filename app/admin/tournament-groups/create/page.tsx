import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TournamentGroupCreateForm from "@/components/features/tournament/TournamentGroupCreateForm";
import { getCurrentSubscriptionInfo } from "@/lib/subscription/subscription-service";

export default async function CreateTournamentGroupPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  // サブスクリプション情報を取得
  const subscriptionInfo = await getCurrentSubscriptionInfo(session.user.id);
  const canCreateTournament = subscriptionInfo?.canCreateTournament ?? true;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin" className="flex items-center text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  管理者ダッシュボードに戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground">大会作成</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  新しい大会を作成します。作成後、部門を追加できます。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  <Link href="/admin">
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
