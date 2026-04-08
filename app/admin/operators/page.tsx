import { ChevronRight, Home } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import OperatorList from "@/components/admin/operators/operator-list";
import Header from "@/components/layout/Header";
import { authOptions, ExtendedUser } from "@/lib/auth";
import { hasOperatorPermission } from "@/lib/operator-permission-check";

export const metadata: Metadata = {
  title: "運営者の管理",
  description: "運営者の登録・編集・削除",
};

export default async function OperatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ group_id?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user as ExtendedUser | undefined;
  const roles = user?.roles || [];
  const isAdmin = roles.includes("admin");
  const loginUserId = user?.loginUserId;
  const isOperatorWithPerm =
    roles.includes("operator") && loginUserId
      ? await hasOperatorPermission(loginUserId, "canManageOperators")
      : false;

  if (!session?.user || (!isAdmin && !isOperatorWithPerm)) {
    redirect("/auth/admin/login");
  }

  const params = await searchParams;
  const groupId = params.group_id ? parseInt(params.group_id, 10) : undefined;

  console.log("OperatorsPage - groupId:", groupId, "params:", params);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto py-8 px-4">
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
            運営者管理
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {groupId ? "大会の運営者管理" : "運営者の管理"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            運営者の登録、編集、削除を行います。運営者ごとに権限とアクセス可能な部門を設定できます。
          </p>
        </div>
        <OperatorList groupId={groupId} />
      </div>
    </div>
  );
}
