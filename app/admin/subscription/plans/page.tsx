import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PlanComparisonCards from "@/components/features/subscription/PlanComparisonCards";

export default async function SubscriptionPlansPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">プラン変更</h1>
              <p className="text-sm text-muted-foreground mt-1">
                ご利用プランを変更できます
              </p>
            </div>
            <div>
              <Button asChild variant="outline">
                <Link href="/my">ダッシュボードに戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PlanComparisonCards />
      </div>
    </div>
  );
}
