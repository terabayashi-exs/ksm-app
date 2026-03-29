// app/my/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import UserAvatarMenu from "@/components/layout/UserAvatarMenu";
import Footer from "@/components/layout/Footer";
import { Home, ChevronRight } from "lucide-react";
import MyDashboardTabs from "@/components/features/my/MyDashboardTabs";
import { fetchDashboardData, fetchOperatorDashboardData, fetchTeamData, TournamentDashboardData, TeamDashboardItem } from "@/lib/dashboard-data";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "マイダッシュボード",
};

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
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 py-6">
            <div>
              <h1 className="text-2xl font-bold text-white">
                マイダッシュボード
              </h1>
              <p className="text-sm text-white/70 mt-1">
                ようこそ、{session.user.name}さん
              </p>
            </div>
            <div className="flex items-center gap-2">
              <UserAvatarMenu
                userName={session.user.name || ''}
                userEmail={session.user.email || ''}
                showDashboardLink={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            マイダッシュボード
          </span>
        </nav>
        <MyDashboardTabs
          roles={roles}
          isSuperadmin={isSuperadmin}
          teamIds={teamIds}
          currentUserId={session.user.id}
          loginUserId={loginUserId}
          initialSportTypes={sportTypes}
          initialTournamentData={tournamentData}
          initialOperatorTournamentData={operatorTournamentData}
          initialTeamData={initialTeamData}
        />
      </div>

      <Footer />
    </div>
  );
}
