// app/my/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import SignOutButton from "@/components/features/auth/SignOutButton";
import MyDashboardTabs from "@/components/features/my/MyDashboardTabs";
import PlanBadge from "@/components/features/subscription/PlanBadge";
import { fetchDashboardData, fetchOperatorDashboardData, fetchTeamData, TournamentDashboardData, TeamDashboardItem } from "@/lib/dashboard-data";
import { db } from "@/lib/db";

export default async function MyDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const roles = (session.user.roles ?? []) as ("admin" | "operator" | "team")[];
  const isSuperadmin = !!(session.user as { isSuperadmin?: boolean }).isSuperadmin;
  const teamIds = (session.user.teamIds ?? []) as string[];
  const loginUserId = (session.user as { loginUserId?: number }).loginUserId ?? 0;

  // 管理者ロールを持つ場合、サーバー側で大会データを取得（高速化）
  let tournamentData: TournamentDashboardData | null = null;
  if (roles.includes("admin") || isSuperadmin) {
    try {
      // isSuperadmin（旧プロバイダーの "admin" ユーザー）は全大会を取得
      // それ以外の管理者は自分が作成した／グループに紐づく大会のみ取得
      const isGlobalAdmin = isSuperadmin || session.user.id === "admin";
      tournamentData = await fetchDashboardData(session.user.id, isGlobalAdmin);
    } catch (e) {
      console.error("大会データ取得エラー:", e);
      // エラー時は null のままクライアント側フォールバック
    }
  }

  // 運営者ロールを持つ場合、サーバー側で大会データを取得（高速化）
  let operatorTournamentData: TournamentDashboardData | null = null;
  if (roles.includes("operator") && loginUserId > 0) {
    try {
      operatorTournamentData = await fetchOperatorDashboardData(loginUserId);
    } catch (e) {
      console.error("運営者大会データ取得エラー:", e);
      // エラー時は null のままクライアント側フォールバック
    }
  }

  // 競技種別マスタをサーバー側で取得（管理者タブでのアイコン表示遅延を回避）
  let sportTypes: Array<{sport_type_id: number; sport_name: string; sport_code: string}> = [];
  try {
    const sportTypesResult = await db.execute('SELECT sport_type_id, sport_name, sport_code FROM m_sport_types ORDER BY sport_type_id');
    sportTypes = sportTypesResult.rows.map(row => ({
      sport_type_id: Number(row.sport_type_id),
      sport_name: String(row.sport_name),
      sport_code: String(row.sport_code),
    }));
  } catch (e) {
    console.error("競技種別マスタ取得エラー:", e);
    // エラー時は空配列のままクライアント側フォールバック
  }

  // チームデータをサーバー側で取得（高速化）
  let initialTeamData: TeamDashboardItem[] | null = null;

  if (loginUserId > 0) {
    try {
      initialTeamData = await fetchTeamData(loginUserId);
    } catch (e) {
      console.error("チームデータ取得エラー:", e);
      // エラー時は null のままクライアント側フォールバック
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                マイダッシュボード
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                ようこそ、{session.user.name}さん
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* 管理者ロールがある場合のみプラン表示 */}
              {(roles.includes("admin") || isSuperadmin) && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">プラン：</span>
                  <PlanBadge apiUrl="/api/my/subscription/current" />
                </div>
              )}
              <Button variant="outline" asChild>
                <Link href="/">TOPページ</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MyDashboardTabs
          roles={roles}
          isSuperadmin={isSuperadmin}
          teamIds={teamIds}
          initialSportTypes={sportTypes}
          initialTournamentData={tournamentData}
          initialOperatorTournamentData={operatorTournamentData}
          initialTeamData={initialTeamData}
        />
      </div>
    </div>
  );
}
