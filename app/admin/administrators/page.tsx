// app/admin/administrators/page.tsx
export const metadata = { title: "利用者マスタ管理" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdministratorManagement from "@/components/features/admin/AdministratorManagement";

export default async function AdministratorPage() {
  const session = await auth();
  
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <h1 className="text-3xl font-bold text-white">利用者マスタ管理</h1>
              <p className="text-sm text-white/70 mt-1">
                システム利用者（管理者）の登録・編集・削除を行います
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdministratorManagement />
      </div>
    </div>
  );
}