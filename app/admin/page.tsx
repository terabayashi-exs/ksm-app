// app/admin/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import IncompleteTournamentGroups from "@/components/features/tournament/IncompleteTournamentGroups";
import SignOutButton from "@/components/features/auth/SignOutButton";
import { db } from "@/lib/db";

export default async function AdminDashboard() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  // 作成中の大会（部門がない大会）の数を取得
  const incompleteGroupsResult = await db.execute(`
    SELECT COUNT(*) as count
    FROM t_tournament_groups tg
    WHERE NOT EXISTS (
      SELECT 1 FROM t_tournaments t WHERE t.group_id = tg.group_id
    )
  `);
  const hasIncompleteGroups = Number(incompleteGroupsResult.rows[0]?.count || 0) > 0;

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

        {/* 大会作成セクション */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-6">大会作成</h2>

          {/* 新規大会作成 */}
          <Card className="border-2 border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 dark:border-green-700 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="text-green-800 dark:text-green-200 flex items-center text-xl">
                🏆 新しい大会を作成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 dark:text-green-300 mb-6">
                新しい大会を作成して、部門の設定やチーム募集を開始できます
              </p>
              <Button asChild size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600 shadow-md">
                <Link href="/admin/tournament-groups/create">
                  <span className="text-lg">➕ 大会作成を開始</span>
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 作成中の大会（部門がまだない大会） */}
          {hasIncompleteGroups && (
            <Card className="border-2 border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/10">
              <CardHeader>
                <CardTitle className="text-amber-800 dark:text-amber-200 flex items-center">
                  ⚠️ 作成中の大会
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-amber-700 dark:text-amber-300 mb-4 text-sm">
                  大会は作成されましたが、まだ部門が設定されていません。部門を作成して大会を完成させましょう。
                </p>
                <IncompleteTournamentGroups />
              </CardContent>
            </Card>
          )}
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
                既存の大会と部門の編集、管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-green-200 hover:border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:border-green-700 dark:hover:bg-green-950/20">
                  <Link href="/admin/tournament-groups">大会一覧</Link>
                </Button>
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/tournaments">部門一覧</Link>
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