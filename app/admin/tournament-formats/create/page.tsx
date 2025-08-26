import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import TournamentFormatCreateForm from "@/components/features/tournament-format/TournamentFormatCreateForm";

export default async function CreateTournamentFormatPage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/tournament-formats" className="flex items-center text-gray-600 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  フォーマット一覧に戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">大会フォーマット作成</h1>
                <p className="text-sm text-gray-500 mt-1">
                  新しい大会フォーマットと試合テンプレートを作成
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentFormatCreateForm />
      </div>
    </div>
  );
}