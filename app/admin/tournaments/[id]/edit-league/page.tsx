export const metadata = { title: "リーグ戦部門編集" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentEditLeagueForm from "@/components/features/tournament/TournamentEditLeagueForm";

interface EditLeaguePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditLeagueTournamentPage({ params }: EditLeaguePageProps) {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  const resolvedParams = await params;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            リーグ戦 部門編集
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">リーグ戦 部門編集</h1>
          <p className="text-sm text-gray-500 mt-1">
            リーグ戦部門の基本情報を編集します
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>リーグ戦 部門編集</CardTitle>
            <p className="text-sm text-gray-500">
              部門の基本情報を編集できます。節ごとの会場・日程は「日程・会場設定」画面から設定してください。
            </p>
          </CardHeader>
          <CardContent>
            <TournamentEditLeagueForm tournamentId={resolvedParams.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
