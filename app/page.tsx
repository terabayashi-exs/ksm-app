// app/page.tsx
import { auth } from "@/lib/auth";
import Footer from "@/components/layout/Footer";
import InitialFooterBanner from "@/components/layout/InitialFooterBanner";
import TopNavBar from "@/components/layout/TopNavBar";
import TournamentGroupCard from "@/components/features/tournament/TournamentGroupCard";
import AnnouncementList from "@/components/features/announcements/AnnouncementList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import Image from "next/image";
import { Trophy, TrendingUp, Clock, Users, Calendar, ArrowRight, Search, Sparkles } from "lucide-react";
import { fetchGroupedPublicTournaments, CategorizedTournaments } from "@/lib/public-tournaments";

export default async function Home() {
  const session = await auth();
  const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

  let groupedData: CategorizedTournaments = { ongoing: [], recruiting: [], before_event: [], completed: [] };
  try {
    groupedData = await fetchGroupedPublicTournaments(teamId);
  } catch (error) {
    console.error('Failed to fetch grouped tournaments:', error);
  }

  // 統計データ（0でないもののみ表示用）
  const statsItems = [
    { label: "開催中", value: groupedData.ongoing.length, icon: TrendingUp, href: "/tournaments?status=ongoing" },
    { label: "募集中", value: groupedData.recruiting.length, icon: Clock, href: "/tournaments?status=recruiting" },
    { label: "開催前", value: groupedData.before_event.length, icon: Calendar, href: "/tournaments?status=before_event" },
    { label: "完了", value: groupedData.completed.length, icon: Trophy, href: "/tournaments?status=completed" },
  ].filter(item => item.value > 0);

  const hasTournaments = groupedData.ongoing.length > 0 || groupedData.recruiting.length > 0 || groupedData.before_event.length > 0 || groupedData.completed.length > 0;

  return (
    <div className="min-h-screen bg-white">
      {/* TOP画面用ナビバー（ヘッダーの代わり） */}
      <TopNavBar />

      {/* ヒーローセクション - hero-gradient背景 + 白テキスト */}
      <section className="bg-hero-gradient py-10 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* ロゴ画像（タイトル付き） */}
            <div className="mb-4 relative w-full max-w-4xl mx-auto">
              <Image
                src="/images/taikaigo-logo-main.svg"
                alt="大会GO"
                width={500}
                height={176}
                className="mx-auto w-full h-auto max-w-xs sm:max-w-md md:max-w-xl lg:max-w-2xl"
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
            <p className="text-sm sm:text-lg text-white/90 max-w-2xl mx-auto leading-relaxed">
              スポーツ大会運営を、楽勝に。
            </p>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            {session?.user ? (
              <Button asChild size="lg" className="group bg-white text-primary hover:bg-white/90 font-bold">
                <Link href="/my">
                  マイダッシュボード
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="group bg-white text-primary hover:bg-white/90 font-bold">
                  <Link href="/tournaments">
                    <Search className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                    大会を探す
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-2 border-white text-white bg-transparent hover:bg-white/10">
                  <Link href="/auth/login">
                    ログイン / 新規登録
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* お知らせセクション - white背景 */}
      <section className="py-6 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnnouncementList />
        </div>
      </section>

      {/* 統計セクション - white背景（0値は非表示） */}
      <section className="py-8 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {statsItems.length > 0 ? (
            <div className={`grid gap-3 sm:gap-5 ${
              statsItems.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
              statsItems.length === 2 ? 'grid-cols-2 max-w-lg mx-auto' :
              statsItems.length === 3 ? 'grid-cols-3 max-w-2xl mx-auto' :
              'grid-cols-2 lg:grid-cols-4'
            }`}>
              {statsItems.map((item) => (
                <Link key={item.label} href={item.href} className="block">
                  <div className="text-center bg-white border-2 border-gray-200 rounded-lg p-4 sm:p-6 cursor-pointer hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                    <item.icon className="h-8 w-8 sm:h-10 sm:w-10 text-primary mx-auto mb-2" />
                    <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{item.value}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">{item.label}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Sparkles className="h-10 w-10 text-primary/40 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                次の大会をお楽しみに！
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 最新大会セクション - gray-50背景 */}
      <section className="py-10 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">最新の大会情報</h2>
            <p className="text-sm text-gray-500 max-w-2xl mx-auto">
              現在公開中の大会や最近開催された大会の情報をご覧いただけます
            </p>
          </div>

          {hasTournaments ? (
            <div className="space-y-8 mb-8">
              {/* 開催中の大会 */}
              {groupedData.ongoing.length > 0 && (
                <div>
                  <div className="flex items-center mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border-2 border-gray-200">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold text-gray-900">開催中の大会</h3>
                      <span className="ml-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                        {groupedData.ongoing.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
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
                  <div className="flex items-center mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border-2 border-gray-200">
                      <Clock className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold text-gray-900">募集中の大会</h3>
                      <span className="ml-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                        {groupedData.recruiting.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
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
                  <div className="flex items-center mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border-2 border-gray-200">
                      <Calendar className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold text-gray-900">開催前の大会</h3>
                      <span className="ml-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-medium">
                        {groupedData.before_event.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
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
                  <div className="flex items-center mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md border-2 border-gray-200">
                      <Trophy className="h-4 w-4 text-gray-500" />
                      <h3 className="text-base font-semibold text-gray-900">完了した大会</h3>
                      <span className="ml-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full text-xs font-medium">
                        {groupedData.completed.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
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
            <div className="text-center py-12">
              <Trophy className="h-16 w-16 text-gray-500/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                新しい大会の開催をお楽しみに！
              </h3>
              <p className="text-gray-500 mb-6 text-sm">
                大会が公開されるとこちらに表示されます。
              </p>
              {session?.user?.role === "admin" && (
                <Button asChild>
                  <Link href="/admin/tournaments/create-new">大会を作成</Link>
                </Button>
              )}
            </div>
          )}

          <div className="text-center">
            <Card className="max-w-md mx-auto border-2 border-gray-200 card-interactive">
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">
                  もっと大会を探してみませんか？
                </h3>
                <Button asChild size="lg" className="group w-full">
                  <Link href="/tournaments">
                    大会を探す
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 機能紹介セクション - white背景 */}
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">システムの特徴</h2>
            <p className="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
              大会GOは、あらゆるスポーツ大会運営に必要な機能を網羅した総合管理システムです
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="bg-white border-2 border-gray-200 rounded-lg p-6 text-center hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">大会管理</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                大会の作成から運営まで、直感的な操作で効率的に管理。様々なスポーツ・競技に対応しています。
              </p>
            </div>

            <div className="bg-white border-2 border-gray-200 rounded-lg p-6 text-center hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">チーム管理</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                参加チームの登録・管理から選手情報の管理まで一元化されています。
              </p>
            </div>

            <div className="bg-white border-2 border-gray-200 rounded-lg p-6 text-center hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">スケジュール管理</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                試合スケジュールの自動生成と管理で、運営負荷を大幅に軽減します。
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* 初期表示時のみ表示される固定フッターバナー */}
      <InitialFooterBanner />
    </div>
  );
}
