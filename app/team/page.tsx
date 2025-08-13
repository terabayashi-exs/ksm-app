// app/team/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import SignOutButton from "@/components/features/auth/SignOutButton";
import TeamProfile from "@/components/features/team/TeamProfile";
import TeamTournaments from "@/components/features/team/TeamTournaments";
import TeamMembers from "@/components/features/team/TeamMembers";

interface SearchParams {
  joined?: string;
  updated?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function TeamDashboard({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;
  
  if (!session || session.user.role !== "team") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">チーム管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                ようこそ、{session.user.name}さん
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" asChild>
                <Link href="/">TOPページ</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 成功メッセージ */}
        {(params.joined || params.updated) && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">
                  {params.joined ? '大会への参加申し込みが完了しました！' : '参加選手の変更が完了しました！'}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  {params.joined ? '参加申し込み済みの大会欄でご確認いただけます。' : '変更内容が反映されました。'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* チーム情報 */}
        <TeamProfile />

        {/* 大会情報 */}
        <div className="mt-12">
          <TeamTournaments />
        </div>

        {/* メンバー管理 */}
        <div className="mt-12">
          <TeamMembers />
        </div>
      </div>
    </div>
  );
}