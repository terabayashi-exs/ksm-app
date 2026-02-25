import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentFormatList from "@/components/features/tournament-format/TournamentFormatList";

export default async function TournamentFormatsPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">大会フォーマット管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                大会フォーマットと試合テンプレートの管理
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/tournament-formats/create" className="flex items-center">
                  <Plus className="h-4 w-4 mr-2" />
                  新規フォーマット作成
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/my">
                  ダッシュボードに戻る
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>📋</span>
              <span>大会フォーマット一覧</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              登録されている大会フォーマットの一覧です。編集・削除・複製が行えます。
            </p>
          </CardHeader>
          <CardContent>
            <TournamentFormatList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}