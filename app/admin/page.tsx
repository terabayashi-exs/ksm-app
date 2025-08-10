// app/admin/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import SignOutButton from "@/components/features/auth/SignOutButton";

export default async function AdminDashboard() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">管理者ダッシュボード</h1>
              <p className="text-sm text-gray-500 mt-1">
                ようこそ、{session.user.name}さん
              </p>
            </div>
            <div>
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 大会一覧セクション */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">大会状況</h2>
          <TournamentDashboardList />
        </div>

        {/* 管理メニューセクション */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">管理メニュー</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 大会管理 */}
          <Card>
            <CardHeader>
              <CardTitle>大会管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                大会の作成、編集、管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/admin/tournaments">大会一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/tournaments/create">新規大会作成</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* チーム管理 */}
          <Card>
            <CardHeader>
              <CardTitle>チーム管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                参加チームの登録、管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/admin/teams">チーム一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/teams/register">チーム登録</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 試合管理 */}
          <Card>
            <CardHeader>
              <CardTitle>試合管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                試合の進行状況管理とリアルタイム監視を行います
              </p>
              <p className="text-sm text-gray-500 mb-4">
                各大会の試合管理は下記の「開催中の大会」から「試合管理」ボタンでアクセスできます
              </p>
            </CardContent>
          </Card>

          {/* 結果管理 */}
          <Card>
            <CardHeader>
              <CardTitle>結果管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                試合結果の入力、確定を行います
              </p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/admin/results">結果一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/results/input">結果入力</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 公開設定 */}
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                一般向け公開ページの設定を行います
              </p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/public" target="_blank">公開ページ確認</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/settings">公開設定</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* システム管理 */}
          <Card>
            <CardHeader>
              <CardTitle>システム管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                システム全体の設定、管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link href="/admin/system">システム設定</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin/backup">データバックアップ</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}