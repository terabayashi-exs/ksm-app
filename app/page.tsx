// app/page.tsx
import { auth } from "@/lib/auth";
import { getPublicTournaments, getTournamentStats } from "@/lib/api/tournaments";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Calendar, MapPin, Users, Trophy, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function Home() {
  const session = await auth();
  const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;
  
  const [tournaments, stats] = await Promise.all([
    getPublicTournaments(teamId),
    getTournamentStats()
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      {/* ヒーローセクション */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Rakusyo GO
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100">
              Sports Tournament Management System
            </p>
            <p className="text-lg mb-10 text-blue-100 max-w-3xl mx-auto">
              あらゆるスポーツ大会の運営から結果公開まで、すべてを一元管理
              <br />
              簡単・楽勝で大会運営ができる総合管理システムです
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {session?.user ? (
                <>
                  {session.user.role === "admin" ? (
                    <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                      <Link href="/admin">管理者ダッシュボード</Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                      <Link href="/team">チームダッシュボード</Link>
                    </Button>
                  )}
                  <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                    <Link href="/public/tournaments">大会一覧を見る</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                    <Link href="/auth/login">ログイン</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600">
                    <Link href="/auth/register">チーム登録</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 統計セクション */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardContent className="pt-6">
                <Trophy className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{stats.total}</h3>
                <p className="text-gray-600">開催された大会数</p>
              </CardContent>
            </Card>
            
            <Card className="text-center">
              <CardContent className="pt-6">
                <Clock className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{stats.ongoing}</h3>
                <p className="text-gray-600">進行中の大会数</p>
              </CardContent>
            </Card>
            
            <Card className="text-center">
              <CardContent className="pt-6">
                <TrendingUp className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{stats.completed}</h3>
                <p className="text-gray-600">完了した大会数</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 最新大会セクション */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">最新の大会情報</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              現在公開中の大会や最近開催された大会の情報をご覧いただけます
            </p>
          </div>

          {tournaments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {tournaments.slice(0, 6).map((tournament) => (
                <Card key={tournament.tournament_id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        tournament.status === 'ongoing' 
                          ? 'bg-green-100 text-green-800'
                          : tournament.status === 'completed'
                          ? 'bg-gray-100 text-gray-800'
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
                    <CardDescription>{tournament.format_name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-gray-600">
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
                      
                      {/* 未参加かつ募集期間中の場合に参加ボタンを表示 */}
                      {!tournament.is_joined &&
                       tournament.recruitment_start_date && 
                       tournament.recruitment_end_date && 
                       new Date(tournament.recruitment_start_date) <= new Date() && 
                       new Date() <= new Date(tournament.recruitment_end_date) && (
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
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  公開中の大会はありません
                </h3>
                <p className="text-gray-600 mb-6">
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
            <div className="border-2 border-blue-600 rounded-lg p-6 bg-blue-50 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
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
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">システムの特徴</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Rakusyo GOは、あらゆるスポーツ大会運営に必要な機能を網羅した総合管理システムです
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <Trophy className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle>大会管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  大会の作成から運営まで、直感的な操作で効率的に管理。様々なスポーツ・競技に対応しています。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle>チーム管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  参加チームの登録・管理から選手情報の管理まで一元化されています。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Calendar className="h-8 w-8 text-purple-600 mb-2" />
                <CardTitle>スケジュール管理</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
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