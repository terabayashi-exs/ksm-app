// app/admin/venues/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import VenueManagement from "@/components/features/admin/VenueManagement";

export default async function VenuePage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">会場マスタ管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                会場情報の登録・編集・削除を行います
              </p>
            </div>
            <div>
              <Button asChild variant="outline">
                <Link href="/admin">ダッシュボードに戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <VenueManagement />
      </div>
    </div>
  );
}