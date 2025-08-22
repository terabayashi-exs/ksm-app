// app/admin/administrators/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import AdministratorManagement from "@/components/features/admin/AdministratorManagement";

export default async function AdministratorPage() {
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
              <h1 className="text-3xl font-bold text-gray-900">利用者マスタ管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                システム利用者（管理者）の登録・編集・削除を行います
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
        <AdministratorManagement />
      </div>
    </div>
  );
}