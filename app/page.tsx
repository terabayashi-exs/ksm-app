// app/page.tsx
import { auth } from "@/lib/auth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InitialFooterBanner from "@/components/layout/InitialFooterBanner";
import TournamentGroupCard from "@/components/features/tournament/TournamentGroupCard";
import AnnouncementList from "@/components/features/announcements/AnnouncementList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { Trophy, TrendingUp, Clock, Users, Calendar } from "lucide-react";

async function getGroupedPublicTournaments(_teamId?: string) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/tournaments/public-grouped`, {
      cache: 'no-store'
    });
    const result = await response.json();

    // ステータス別にグループ化されたデータ構造に対応
    // result.data = { recruiting: [...], before_event: [...], ongoing: [...], completed: [...] }
    if (result.success && result.data) {
      return {
        ongoing: result.data.ongoing || [],
        recruiting: result.data.recruiting || [],
        before_event: result.data.before_event || [],
        completed: result.data.completed || []
      };
    }

    return { ongoing: [], recruiting: [], before_event: [], completed: [] };
  } catch (error) {
    console.error('Failed to fetch grouped tournaments:', error);
    return { ongoing: [], recruiting: [], before_event: [], completed: [] };
  }
}

export default async function Home() {
  const session = await auth();
  const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

  const groupedData = await getGroupedPublicTournaments(teamId);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* ヒーローセクション */}
      <section className="relative py-16 overflow-hidden bg-transparent">
        {/* コンテンツ */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* 大きなロゴ画像（透過対応） */}
            <div className="mb-8 relative w-full max-w-6xl mx-auto">
              <Image
                src="/images/systemlogo_1000_250-タイトルなし.png"
                alt="楽勝 GO"
                width={1000}
                height={250}
                className="mx-auto w-full h-auto max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl"
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
            <p className="text-lg md:text-xl mb-6 text-muted-foreground max-w-3xl mx-auto relative z-10">
              あらゆるスポーツ大会の運営から結果公開まで、すべてを一元管理
              <br />
              簡単・楽勝で大会運営ができる総合管理システムです
            </p>
          </div>
        </div>
      </section>

      {/* アクションボタンセクション */}
      <section className="py-8 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {session?.user ? (
              <>
                {session.user.role === "admin" || session.user.role === "operator" ? (
                  <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                    <Link href="/admin">管理者ダッシュボード</Link>
                  </Button>
                ) : session.user.role === "team" ? (
                  <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                    <Link href="/team">チームダッシュボード</Link>
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                  <Link href="/auth/admin/login">管理者ログイン</Link>
                </Button>
                <Button asChild size="lg" className="bg-green-600 text-white hover:bg-green-700">
                  <Link href="/auth/team/login">チーム代表者ログイン</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
                  <Link href="/auth/register/email">チーム登録</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* お知らせセクション */}
      <section className="py-8 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnnouncementList />
        </div>
      </section>

      {/* 統計セクション */}
      <section className="relative py-16 overflow-hidden">
        {/* シンプルな背景 */}
        <div className="absolute inset-0">
          {/* 薄い芝生風グラデーション */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-lime-50/15 to-transparent dark:from-transparent dark:via-green-900/8 dark:to-transparent"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Link href="/tournaments?status=ongoing" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <TrendingUp className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{groupedData.ongoing.length}</h3>
                  <p className="text-muted-foreground">開催中の大会数</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/tournaments?status=recruiting" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <Clock className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{groupedData.recruiting.length}</h3>
                  <p className="text-muted-foreground">募集中の大会数</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/tournaments?status=before_event" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <Calendar className="h-12 w-12 text-orange-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{groupedData.before_event.length}</h3>
                  <p className="text-muted-foreground">開催前の大会数</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/tournaments?status=completed" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <Trophy className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{groupedData.completed.length}</h3>
                  <p className="text-muted-foreground">完了した大会数</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* 最新大会セクション */}
      <section className="relative py-16 bg-card/50 overflow-hidden">
        {/* シンプルな背景 */}
        <div className="absolute inset-0">
          {/* 芝生風の背景 */}
          <div className="absolute inset-0 bg-gradient-to-b from-lime-50/25 via-green-50/15 to-transparent dark:from-green-900/15 dark:via-green-900/8 dark:to-transparent"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">最新の大会情報</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              現在公開中の大会や最近開催された大会の情報をご覧いただけます
            </p>
          </div>

          {(groupedData.ongoing.length > 0 || groupedData.recruiting.length > 0 || groupedData.before_event.length > 0 || groupedData.completed.length > 0) ? (
            <div className="space-y-12 mb-8">
              {/* 開催中の大会 */}
              {groupedData.ongoing.length > 0 && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg border-2 border-green-300 dark:border-green-700">
                      <TrendingUp className="h-5 w-5 text-green-700 dark:text-green-300" />
                      <h3 className="text-xl font-bold text-green-800 dark:text-green-200">開催中の大会</h3>
                      <span className="ml-2 px-2 py-1 bg-green-600 text-white rounded-full text-sm font-medium">
                        {groupedData.ongoing.length}件
                      </span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {groupedData.ongoing.map((groupData: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <TournamentGroupCard
                        key={groupData.group.group_id}
                        group={groupData.group}
                        tournaments={groupData.divisions}
                        userRole={session?.user?.role}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 募集中の大会 */}
              {groupedData.recruiting.length > 0 && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                      <Clock className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                      <h3 className="text-xl font-bold text-blue-800 dark:text-blue-200">募集中の大会</h3>
                      <span className="ml-2 px-2 py-1 bg-blue-600 text-white rounded-full text-sm font-medium">
                        {groupedData.recruiting.length}件
                      </span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {groupedData.recruiting.map((groupData: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <TournamentGroupCard
                        key={groupData.group.group_id}
                        group={groupData.group}
                        tournaments={groupData.divisions}
                        userRole={session?.user?.role}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 開催前の大会 */}
              {groupedData.before_event.length > 0 && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                      <Calendar className="h-5 w-5 text-orange-700 dark:text-orange-300" />
                      <h3 className="text-xl font-bold text-orange-800 dark:text-orange-200">開催前の大会</h3>
                      <span className="ml-2 px-2 py-1 bg-orange-600 text-white rounded-full text-sm font-medium">
                        {groupedData.before_event.length}件
                      </span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {groupedData.before_event.map((groupData: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <TournamentGroupCard
                        key={groupData.group.group_id}
                        group={groupData.group}
                        tournaments={groupData.divisions}
                        userRole={session?.user?.role}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 完了した大会 */}
              {groupedData.completed.length > 0 && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-100 to-slate-100 dark:from-gray-900/30 dark:to-slate-900/30 rounded-lg border-2 border-gray-300 dark:border-gray-700">
                      <Trophy className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">完了した大会</h3>
                      <span className="ml-2 px-2 py-1 bg-gray-600 text-white rounded-full text-sm font-medium">
                        {groupedData.completed.length}件
                      </span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {groupedData.completed.map((groupData: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <TournamentGroupCard
                        key={groupData.group.group_id}
                        group={groupData.group}
                        tournaments={groupData.divisions}
                        userRole={session?.user?.role}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <Trophy className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  公開中の大会はありません
                </h3>
                <p className="text-muted-foreground mb-6">
                  現在公開されている大会情報がありません。
                  新しい大会が開催されるまでお待ちください。
                </p>
                {session?.user?.role === "admin" && (
                  <Button asChild>
                    <Link href="/admin/tournaments/create-new">大会を作成</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <div className="text-center">
            <div className="border-2 border-blue-600 rounded-lg p-6 bg-blue-50 dark:bg-blue-950/20 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                もっと大会を探してみませんか？
              </h3>
              <Button asChild size="lg" className="w-full">
                <Link href="/tournaments">大会を探す</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 機能紹介セクション */}
      <section className="relative py-16 bg-muted/30 overflow-hidden">
        {/* シンプルな背景 */}
        <div className="absolute inset-0">
          {/* 芝生風の薄い背景 */}
          <div className="absolute inset-0 bg-gradient-to-t from-lime-50/18 via-transparent to-transparent dark:from-green-900/10 dark:via-transparent dark:to-transparent"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">システムの特徴</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              楽勝 GOは、あらゆるスポーツ大会運営に必要な機能を網羅した総合管理システムです
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-card/90 backdrop-blur-sm border-border/50">
              <CardHeader>
                <Trophy className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle>大会管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  大会の作成から運営まで、直感的な操作で効率的に管理。様々なスポーツ・競技に対応しています。
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/90 backdrop-blur-sm border-border/50">
              <CardHeader>
                <Users className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle>チーム管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  参加チームの登録・管理から選手情報の管理まで一元化されています。
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/90 backdrop-blur-sm border-border/50">
              <CardHeader>
                <Calendar className="h-8 w-8 text-purple-600 mb-2" />
                <CardTitle>スケジュール管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  試合スケジュールの自動生成と管理で、運営負荷を大幅に軽減します。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />

      {/* 初期表示時のみ表示される固定フッターバナー */}
      <InitialFooterBanner />
    </div>
  );
}