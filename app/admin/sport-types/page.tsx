import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { Plus, Edit, Trash2, Trophy, Timer, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SportTypesPage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
    redirect("/auth/login");
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
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">競技種別マスタ管理</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            大会で使用する競技種別の管理を行います
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
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
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <Trophy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
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
                    <span className="text-gray-500 dark:text-gray-400">ピリオド数</span>
                    <span className="font-medium">
                      通常 {String(sport.regular_period_count)} / 最大 {String(sport.max_period_count)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">スコアタイプ</span>
                    <div className="flex items-center space-x-1">
                      {scoreTypeIcon}
                      <span className="font-medium">{String(sport.score_unit)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">標準試合時間</span>
                    <span className="font-medium">{String(sport.default_match_duration)}分</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ピリオド構成:</p>
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

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between text-xs text-gray-500 dark:text-gray-400">
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
          <p className="text-gray-500 dark:text-gray-400">競技種別が登録されていません</p>
          <Button asChild className="mt-4">
            <Link href="/admin/sport-types/create">
              <Plus className="h-4 w-4 mr-2" />
              競技種別を作成
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}