import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SportTypeCreateForm from "@/components/features/sport-type/SportTypeCreateForm";

export default async function CreateSportTypePage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/sport-types" className="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  競技種別一覧に戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">競技種別作成</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  新しい競技種別を登録します
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SportTypeCreateForm />
      </div>
    </div>
  );
}