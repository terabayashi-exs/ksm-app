import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentFormatList from "@/components/features/tournament-format/TournamentFormatList";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TournamentFormatsPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">大会フォーマット管理</h1>
            <p className="text-sm text-white/70 mt-1">
              大会フォーマットと試合テンプレートの管理
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/tournament-formats/create">
              <Plus className="h-4 w-4 mr-2" />
              新規フォーマット作成
            </Link>
          </Button>
        </div>
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