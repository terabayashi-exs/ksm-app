export const metadata = { title: "部門作成" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentCreateNewForm from "@/components/features/tournament/TournamentCreateNewForm";
import { canAddDivision } from "@/lib/subscription/plan-checker";

interface PageProps {
  searchParams: Promise<{ group_id?: string }>;
}

export default async function CreateNewTournamentPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const params = await searchParams;
  const groupId = params.group_id ? Number(params.group_id) : null;

  // group_idが指定されている場合は部門追加可否をチェック
  let divisionCheckResult = null;
  if (groupId) {
    divisionCheckResult = await canAddDivision(session.user.id, groupId);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-2xl font-bold text-white">部門作成</h1>
              <p className="text-sm text-white/70 mt-1">
                大会に属する部門（カテゴリー）を作成します
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
        {/* 部門追加制限に達している場合のエラー表示 */}
        {divisionCheckResult && !divisionCheckResult.allowed ? (
          <Card className="border-2 border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-destructive">
                <AlertTriangle className="w-6 h-6" />
                <span>部門作成制限に達しています</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-destructive">
                <p className="font-semibold mb-2">{divisionCheckResult.reason}</p>
                <div className="space-y-1 text-sm">
                  <p>現在の部門数: {divisionCheckResult.current}部門</p>
                  <p>プラン上限: {divisionCheckResult.limit === -1 ? '無制限' : `${divisionCheckResult.limit}部門`}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button asChild variant="default" className="bg-primary hover:bg-primary/90">
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>🏆</span>
                <span>新規部門作成</span>
              </CardTitle>
              <p className="text-sm text-gray-500">
                大会に属する部門をテンプレートシステムで作成します
              </p>
            </CardHeader>
            <CardContent>
              <TournamentCreateNewForm />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}