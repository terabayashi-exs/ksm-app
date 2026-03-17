import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SportTypeCreateForm from "@/components/features/sport-type/SportTypeCreateForm";

export default async function CreateSportTypePage() {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/auth/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">競技種別作成</h1>
            <p className="text-sm text-white/70 mt-1">
              新しい競技種別を登録します
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/sport-types">
              <ArrowLeft className="h-4 w-4 mr-1" />
              競技種別一覧に戻る
            </Link>
          </Button>
        </div>
        <SportTypeCreateForm />
      </div>
    </div>
  );
}