// app/admin/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import IncompleteTournamentGroups from "@/components/features/tournament/IncompleteTournamentGroups";
import SignOutButton from "@/components/features/auth/SignOutButton";
import PlanBadge from "@/components/features/subscription/PlanBadge";
import { db } from "@/lib/db";
import { getCurrentSubscriptionInfo } from "@/lib/subscription/subscription-service";

export default async function AdminDashboard() {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const isOperator = session.user.role === "operator";

  // 運営者の権限情報を取得
  const operatorPermissions: Record<number, Record<string, boolean>> = {};
  if (isOperator && session.user.operatorId) {
    const permissionsResult = await db.execute(`
      SELECT tournament_id, permissions
      FROM t_operator_tournament_access
      WHERE operator_id = ?
    `, [session.user.operatorId]);

    permissionsResult.rows.forEach((row) => {
      const tournamentId = Number(row.tournament_id);
      const permissions = row.permissions ? JSON.parse(String(row.permissions)) : {};
      operatorPermissions[tournamentId] = permissions;
    });
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

  // サブスクリプション情報を取得（運営者は取得しない）
  const subscriptionInfo = isOperator ? null : await getCurrentSubscriptionInfo(session.user.id);
  const canCreateTournament = subscriptionInfo?.canCreateTournament ?? true;
  const isTrialExpired = subscriptionInfo?.isTrialExpired ?? false;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {isOperator ? "運営者ダッシュボード" : "管理者ダッシュボード"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                ようこそ、{session.user.name}さん
              </p>
            </div>
            <div className="flex items-center gap-4">
              {!isOperator && <PlanBadge />}
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 期限切れ警告（管理者のみ） */}
        {!isOperator && isTrialExpired && (
          <Alert variant="destructive" className="mb-6 border-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-lg font-bold">無料トライアル期間が終了しました</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-3">現在は以下の操作のみ可能です：</p>
              <ul className="list-disc list-inside space-y-1 mb-4 ml-2">
                <li>大会・部門の閲覧</li>
                <li>大会のアーカイブ化</li>
                <li>大会・部門の削除</li>
              </ul>
              <p className="font-semibold mb-3">
                ⚠️ 編集・新規作成・試合結果入力はできません
              </p>
              <div className="flex gap-3">
                <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Link href="/admin/subscription/plans">
                    プランを選択して継続
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/admin/tournaments">
                    大会を整理する
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 大会一覧セクション */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">大会状況</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isOperator ? "アクセス可能な部門の状況を確認できます" : "各大会の部門別状況を確認できます"}
          </p>
          <TournamentDashboardList
            isTrialExpired={isTrialExpired}
            accessibleTournamentIds={isOperator ? session.user.accessibleTournaments : undefined}
            operatorPermissions={isOperator ? operatorPermissions : undefined}
          />
        </div>

        {/* 大会作成セクション（管理者のみ） */}
        {!isOperator && (
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
              {isTrialExpired ? (
                <div className="space-y-3">
                  <Button disabled size="lg" className="w-full bg-gray-400 text-white cursor-not-allowed">
                    <span className="text-lg">🔒 トライアル期間終了</span>
                  </Button>
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">
                    新規大会作成にはプランのアップグレードが必要です
                  </p>
                  <Button asChild size="sm" variant="outline" className="w-full border-2 border-blue-500 text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/20">
                    <Link href="/admin/subscription/plans">
                      プランを選択
                    </Link>
                  </Button>
                </div>
              ) : canCreateTournament ? (
                <Button asChild size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600 shadow-md">
                  <Link href="/admin/tournament-groups/create">
                    <span className="text-lg">➕ 大会作成を開始</span>
                  </Link>
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button disabled size="lg" className="w-full bg-gray-400 text-white cursor-not-allowed">
                    <span className="text-lg">🔒 大会作成上限に達しています</span>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="w-full border-2 border-blue-500 text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/20">
                    <Link href="/admin/subscription/plans">
                      プランをアップグレード
                    </Link>
                  </Button>
                </div>
              )}
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
        )}

        {/* 管理メニューセクション（管理者のみ） */}
        {!isOperator && (
        <>
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

          {/* 参加チーム管理 */}
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardHeader>
              <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center">
                👥 参加チーム管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700 dark:text-blue-300 mb-4">
                各大会の参加チーム状態を管理します（参加確定・キャンセル待ち・辞退申請・キャンセル）
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-200 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
                  <Link href="/admin/tournaments">大会を選択して管理</Link>
                </Button>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                ℹ️ 各部門カードに参加状況が表示されます
              </p>
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

          {/* お知らせ管理（adminユーザーのみ） */}
          {session.user.id === "admin" && (
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
              <CardHeader>
                <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center">
                  📢 お知らせ管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-700 dark:text-blue-300 mb-4">
                  TOPページに表示するお知らせの作成・編集・削除を行います
                </p>
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-700 dark:hover:border-blue-600 dark:hover:bg-blue-950/30">
                    <Link href="/admin/announcements">お知らせ管理</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
        </>
        )}
      </div>
    </div>
  );
}