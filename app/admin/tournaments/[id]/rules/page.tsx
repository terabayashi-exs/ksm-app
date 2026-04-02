export const metadata = { title: "ルール設定" };

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import Header from "@/components/layout/Header";
import TournamentRulesForm from "@/components/features/tournament-rules/TournamentRulesForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentRulesPage({ params }: Props) {
  const resolvedParams = await params;
  const session = await auth();
  
  if (!session || (session.user.role !== "admin" && session.user.role !== "operator")) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            大会ルール設定
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">大会ルール設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            競技ルールの詳細設定を行います
          </p>
        </div>
        <TournamentRulesForm tournamentId={parseInt(resolvedParams.id)} />
      </div>
    </div>
  );
}