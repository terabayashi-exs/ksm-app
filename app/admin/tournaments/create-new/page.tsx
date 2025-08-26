import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentCreateNewForm from "@/components/features/tournament/TournamentCreateNewForm";

export default async function CreateNewTournamentPage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin" className="flex items-center text-gray-600 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  管理者ダッシュボードに戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">大会作成</h1>
                <p className="text-sm text-gray-500 mt-1">
                  新しいテンプレートシステムを使用した大会作成
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>🏆</span>
              <span>新規大会作成</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              コート番号・時間指定機能付きのテンプレートシステムで大会を作成します
            </p>
          </CardHeader>
          <CardContent>
            <TournamentCreateNewForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}