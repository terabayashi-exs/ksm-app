"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SponsorBannerForm from "@/components/admin/SponsorBannerForm";
import Header from "@/components/layout/Header";

export default function CreateSponsorBannerPage() {
  const params = useParams();
  const tournamentId = params.id as string;

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
          <Link
            href={`/admin/tournaments/${tournamentId}/sponsor-banners`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            スポンサーバナー管理
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            バナー新規作成
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">バナー新規作成</h1>
          <p className="text-sm text-gray-500 mt-1">新しいスポンサーバナーを作成します</p>
        </div>
        <SponsorBannerForm tournamentId={tournamentId} mode="create" />
      </div>
    </div>
  );
}
