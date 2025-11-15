// app/page.tsx
import { auth } from "@/lib/auth";
import { getTournamentStats } from "@/lib/api/tournaments";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TournamentGroupCard from "@/components/features/tournament/TournamentGroupCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, Users, Trophy, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

async function getGroupedPublicTournaments(_teamId?: string) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/tournaments/public-grouped`, {
      cache: 'no-store'
    });
    const result = await response.json();

    // Phase 4.1で変更された新しいデータ構造に対応
    // result.dataは大会グループの配列 [{ group: {...}, divisions: [...] }]
    if (result.success && result.data) {
      return {
        grouped: result.data,
        ungrouped: []
      };
    }

    return { grouped: [], ungrouped: [] };
  } catch (error) {
    console.error('Failed to fetch grouped tournaments:', error);
    return { grouped: [], ungrouped: [] };
  }
}

export default async function Home() {
  const session = await auth();
  const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;
  
  const [groupedData, stats] = await Promise.all([
    getGroupedPublicTournaments(teamId),
    getTournamentStats()
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* ヒーローセクション */}
      <section className="relative py-16 overflow-hidden">
        {/* シンプルな背景 */}
        <div className="absolute inset-0">
          {/* ロゴに合わせた明るい芝生風のグラデーション背景 */}
          <div className="absolute inset-0 bg-gradient-to-b from-lime-100/60 via-green-100/40 to-emerald-50/20 dark:from-green-800/30 dark:via-green-900/20 dark:to-transparent"></div>
        </div>
        
        {/* コンテンツ */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* 大きなロゴ画像 */}
            <div className="mb-8 relative w-full max-w-6xl mx-auto">
              <Image
                src="/images/system_logo.png"
                alt="楽勝 GO"
                width={1000}
                height={1000}
                className="mx-auto w-full h-auto max-w-sm sm:max-w-lg md:max-w-2xl lg:max-w-4xl relative z-10"
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
                {session.user.role === "admin" ? (
                  <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                    <Link href="/admin">管理者ダッシュボード</Link>
                  </Button>
                ) : (
                  <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                    <Link href="/team">チームダッシュボード</Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
                  <Link href="/public/tournaments">大会一覧を見る</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="bg-blue-600 text-white hover:bg-blue-700">
                  <Link href="/auth/login">ログイン</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
                  <Link href="/auth/register">チーム登録</Link>
                </Button>
              </>
            )}
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Link href="/tournaments?status=recruiting" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <Trophy className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{stats.total}</h3>
                  <p className="text-muted-foreground">開催予定の大会数</p>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/tournaments?status=ongoing" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <Clock className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{stats.ongoing}</h3>
                  <p className="text-muted-foreground">進行中の大会数</p>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/tournaments?status=completed" className="block">
              <Card className="text-center hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <TrendingUp className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                  <h3 className="text-3xl font-bold text-foreground mb-2">{stats.completed}</h3>
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

          {(groupedData.grouped.length > 0 || groupedData.ungrouped.length > 0) ? (
            <div className="space-y-6 mb-8">
              {/* グループ化された大会 */}
              {groupedData.grouped.map((groupData: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <TournamentGroupCard
                  key={groupData.group.group_id}
                  group={groupData.group}
                  tournaments={groupData.divisions}
                  userRole={session?.user?.role}
                />
              ))}
              
              {/* グループ化されていない個別大会 */}
              {groupedData.ungrouped.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groupedData.ungrouped.slice(0, 6).map((tournament: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                    <Card key={tournament.tournament_id} className="hover:shadow-lg transition-shadow bg-card/80 backdrop-blur-sm border-border/50 relative overflow-hidden">
                      {/* 管理者ロゴ背景 */}
                      {tournament.logo_blob_url && (
                        <div className="absolute inset-0 opacity-10">
                          <Image
                            src={tournament.logo_blob_url}
                            alt={tournament.organization_name || '主催者ロゴ'}
                            fill
                            className="object-contain object-center"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          />
                        </div>
                      )}
                      <CardHeader className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tournament.status === 'ongoing' 
                              ? 'bg-green-100 text-green-800'
                              : tournament.status === 'completed'
                              ? 'bg-muted text-foreground'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {tournament.status === 'ongoing' ? '進行中' : 
                             tournament.status === 'completed' ? '完了' : '開催予定'}
                          </span>
                          {tournament.is_joined && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              参加済み
                            </span>
                          )}
                        </div>
                        <CardTitle className="text-lg">{tournament.tournament_name}</CardTitle>
                        <CardDescription>
                          <span>{tournament.format_name}</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-2" />
                            {tournament.event_start_date ? formatDate(tournament.event_start_date) : '日程未定'}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-2" />
                            {tournament.venue_name || '会場未定'}
                          </div>
                          <div className="flex items-center">
                            <Users className="h-4 w-4 mr-2" />
                            {tournament.team_count}チーム参加
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <Button asChild variant="outline" className="w-full">
                            <Link href={`/public/tournaments/${tournament.tournament_id}`}>
                              詳細を見る
                            </Link>
                          </Button>
                          
                          {/* 参加済みの場合は参加選手変更ボタンを表示 */}
                          {tournament.is_joined && session?.user?.role === 'team' && (
                            <Button asChild variant="outline" className="w-full">
                              <Link href={`/tournaments/${tournament.tournament_id}/teams`}>
                                参加選手の変更
                              </Link>
                            </Button>
                          )}
                          
                          {/* 未参加かつ募集期間中かつ進行中・完了済みではない場合に参加ボタンを表示 */}
                          {!tournament.is_joined &&
                           tournament.recruitment_start_date && 
                           tournament.recruitment_end_date && 
                           new Date(tournament.recruitment_start_date) <= new Date() && 
                           new Date() <= new Date(tournament.recruitment_end_date) &&
                           tournament.status !== 'ongoing' &&
                           tournament.status !== 'completed' && (
                            <Button asChild variant="outline" className="w-full">
                              <Link href={
                                session?.user?.role === 'team' 
                                  ? `/tournaments/${tournament.tournament_id}/join`
                                  : `/auth/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.tournament_id}/join`)}`
                              }>
                                大会に参加する
                              </Link>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
    </div>
  );
}