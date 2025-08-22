// app/admin/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import SignOutButton from "@/components/features/auth/SignOutButton";
import NotificationBanner from "@/components/features/tournament/NotificationBanner";

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
        {/* 通知バナー */}
        <NotificationBanner />
        
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
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/tournaments">大会一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full hover:border-blue-300 hover:bg-blue-50">
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
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/teams">チーム一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/teams/register">チーム登録</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* マスタ管理 */}
          <Card>
            <CardHeader>
              <CardTitle>マスタ管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                システムの基本データを管理します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/venues">会場マスタ</Link>
                </Button>
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/administrators">利用者マスタ</Link>
                </Button>
              </div>
            </CardContent>
          </Card>


          {/* 辞退申請管理 */}
          <Card>
            <CardHeader>
              <CardTitle>辞退申請管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                チームからの大会辞退申請を確認・承認・却下します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50">
                  <Link href="/admin/withdrawal-requests">辞退申請一覧</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}