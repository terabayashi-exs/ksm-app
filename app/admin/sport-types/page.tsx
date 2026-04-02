export const metadata = { title: "競技種別マスタ管理" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { Plus, Edit, Trash2, Trophy, Timer, Target, ChevronRight, Home } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SportTypesPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/admin/login");
  }

  // 競技種別一覧を取得
  const sportTypesResult = await db.execute(`
    SELECT 
      s.*,
      COUNT(f.format_id) as format_count,
      COUNT(DISTINCT t.tournament_id) as tournament_count
    FROM m_sport_types s
    LEFT JOIN m_tournament_formats f ON s.sport_type_id = f.sport_type_id
    LEFT JOIN t_tournaments t ON s.sport_type_id = t.sport_type_id
    GROUP BY s.sport_type_id, s.sport_name, s.sport_code, s.max_period_count, 
             s.regular_period_count, s.score_type, s.default_match_duration, 
             s.score_unit, s.period_definitions, s.result_format, s.created_at, s.updated_at
    ORDER BY s.sport_type_id
  `);

  const sportTypes = sportTypesResult.rows;

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto p-6 max-w-7xl">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            競技種別マスタ管理
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">競技種別マスタ管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            大会で使用する競技種別の管理を行います
          </p>
        </div>
        <div className="flex items-center justify-end mb-6">
          <Button asChild variant="outline">
            <Link href="/admin/sport-types/create">
              <Plus className="h-4 w-4 mr-2" />
              新規競技種別
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sportTypes.map((sport) => {
          const periodDefinitions = JSON.parse(String(sport.period_definitions));
          const scoreTypeIcon = sport.score_type === 'time' ? <Timer className="h-4 w-4" /> : 
                                sport.score_type === 'rank' ? <Target className="h-4 w-4" /> :
                                <Trophy className="h-4 w-4" />;
          
          return (
            <Card key={Number(sport.sport_type_id)} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Trophy className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{String(sport.sport_name)}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        コード: {String(sport.sport_code)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Link href={`/admin/sport-types/${sport.sport_type_id}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    {Number(sport.format_count) === 0 && Number(sport.tournament_count) === 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">ピリオド数</span>
                    <span className="font-medium">
                      通常 {String(sport.regular_period_count)} / 最大 {String(sport.max_period_count)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">スコアタイプ</span>
                    <div className="flex items-center space-x-1">
                      {scoreTypeIcon}
                      <span className="font-medium">{String(sport.score_unit)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">標準試合時間</span>
                    <span className="font-medium">{String(sport.default_match_duration)}分</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium">ピリオド構成:</p>
                  <div className="flex flex-wrap gap-1">
                    {periodDefinitions.map((period: { period_id: number; period_name: string; type: string; duration?: number }) => (
                      <Badge 
                        key={period.period_id} 
                        variant={period.type === 'extra' ? 'secondary' : period.type === 'penalty' ? 'destructive' : 'default'}
                        className="text-xs"
                      >
                        {period.period_name}
                        {period.duration && <span className="ml-1 opacity-70">({period.duration}分)</span>}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 flex justify-between text-xs text-gray-500">
                  <span>{Number(sport.format_count)}個のフォーマット</span>
                  <span>{Number(sport.tournament_count)}個の大会</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

        {sportTypes.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">競技種別が登録されていません</p>
            <Button asChild className="mt-4">
              <Link href="/admin/sport-types/create">
                <Plus className="h-4 w-4 mr-2" />
                競技種別を作成
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}