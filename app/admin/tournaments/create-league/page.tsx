export const metadata = { title: "リーグ戦部門作成" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TournamentCreateLeagueForm from "@/components/features/tournament/TournamentCreateLeagueForm";

export default async function CreateLeagueTournamentPage() {
  const session = await auth();

  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-2xl font-bold text-white">リーグ戦 部門作成</h1>
              <p className="text-sm text-white/70 mt-1">
                節ごとに会場・日程を設定できるリーグ戦部門を作成します
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
