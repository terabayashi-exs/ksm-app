export const metadata = { title: "大会形式作成" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import TournamentFormatCreateForm from "@/components/features/tournament-format/TournamentFormatCreateForm";

export default async function CreateTournamentFormatPage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold text-white">大会フォーマット作成</h1>
            <p className="text-sm text-white/70 mt-1">
              新しい大会フォーマットと試合テンプレートを作成
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tournament-formats">
              <ArrowLeft className="h-4 w-4 mr-1" />
              フォーマット一覧に戻る
            </Link>
          </Button>
        </div>
        <TournamentFormatCreateForm />
      </div>
    </div>
  );
}