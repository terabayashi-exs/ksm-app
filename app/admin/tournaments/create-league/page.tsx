export const metadata = { title: "リーグ戦部門作成" };

import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import TournamentCreateLeagueForm from "@/components/features/tournament/TournamentCreateLeagueForm";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function CreateLeagueTournamentPage() {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link
            href="/my?tab=admin"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            リーグ戦 部門作成
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">リーグ戦 部門作成</h1>
          <p className="text-sm text-gray-500 mt-1">
            節ごとに会場・日程を設定できるリーグ戦部門を作成します
          </p>
        </div>
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tournaments/create-new">
              <ArrowLeft className="h-4 w-4 mr-1" />
              部門作成に戻る
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>リーグ戦 部門作成</span>
            </CardTitle>
            <p className="text-sm text-gray-500">
              リーグ戦の基本情報を入力してください。節ごとの会場・日程は作成後に設定できます。
            </p>
          </CardHeader>
          <CardContent>
            <TournamentCreateLeagueForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
