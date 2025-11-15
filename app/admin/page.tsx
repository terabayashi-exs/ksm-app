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
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">管理者ダッシュボード</h1>
              <p className="text-sm text-muted-foreground mt-1">
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
          <h2 className="text-2xl font-bold text-foreground mb-6">大会状況</h2>
          <p className="text-sm text-muted-foreground mb-4">
            各大会の部門別状況を確認できます
          </p>
          <TournamentDashboardList />
        </div>

        {/* 管理メニューセクション */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-6">管理メニュー</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 大会・部門管理 */}
          <Card>
            <CardHeader>
              <CardTitle>大会・部門管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                大会と部門の作成、編集、管理を行います
              </p>
              <div className="space-y-2">
                <div className="pb-2 mb-2 border-b">
                  <p className="text-xs font-medium text-muted-foreground mb-2">大会管理</p>
                  <div className="space-y-2">
                    <Button asChild variant="outline" className="w-full border-2 border-green-200 hover:border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:border-green-700 dark:hover:bg-green-950/20">
                      <Link href="/admin/tournament-groups">大会一覧</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full border-2 border-green-200 hover:border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:border-green-700 dark:hover:bg-green-950/20">
                      <Link href="/admin/tournament-groups/create">大会作成</Link>
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">部門管理</p>
                  <div className="space-y-2">
                    <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                      <Link href="/admin/tournaments">部門一覧</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                      <Link href="/admin/tournaments/create-new">部門作成</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* チーム管理 */}
          <Card>
            <CardHeader>
              <CardTitle>チーム管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                部門ごとのチーム情報の管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/teams">チーム一覧</Link>
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
              <p className="text-muted-foreground mb-4">
                システムの基本データを管理します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/venues">会場マスタ</Link>
                </Button>
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/administrators">利用者マスタ</Link>
                </Button>
                {session.user.id === "admin" && (
                  <>
                    <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                      <Link href="/admin/sport-types">競技種別マスタ</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                      <Link href="/admin/tournament-formats">大会フォーマット</Link>
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>


          {/* 大会データ複製機能 */}
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="text-green-800 dark:text-green-200 flex items-center">
                📋 大会データ複製
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 dark:text-green-300 mb-4">
                既存の大会を複製してデモ用データを作成できます
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-green-300 hover:border-green-400 hover:bg-green-100 dark:border-green-700 dark:hover:border-green-600 dark:hover:bg-green-950/30">
                  <Link href="/admin/tournaments/duplicate">複製機能を開く</Link>
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
              <p className="text-muted-foreground mb-4">
                チームからの大会辞退申請を確認・承認・却下します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/withdrawal-requests">辞退申請一覧</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* プロフィール設定 */}
          <Card>
            <CardHeader>
              <CardTitle>プロフィール設定</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                管理者情報の確認と組織ロゴの設定・管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-purple-200 hover:border-purple-300 hover:bg-purple-50 dark:border-purple-800 dark:hover:border-purple-700 dark:hover:bg-purple-950/20">
                  <Link href="/admin/profile">プロフィール・ロゴ設定</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Blobストレージ管理 */}
          <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="text-orange-800 dark:text-orange-200 flex items-center">
                📦 Blobストレージ管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700 dark:text-orange-300 mb-4">
                大会アーカイブデータのBlobストレージへの移行・管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-orange-300 hover:border-orange-400 hover:bg-orange-100 dark:border-orange-700 dark:hover:border-orange-600 dark:hover:bg-orange-950/30">
                  <Link href="/admin/blob-migration">Blob移行ダッシュボード</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}