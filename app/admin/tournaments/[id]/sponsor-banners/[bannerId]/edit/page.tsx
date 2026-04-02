'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';
import SponsorBannerForm from '@/components/admin/SponsorBannerForm';
import type { SponsorBanner } from '@/lib/sponsor-banner-specs';

export default function EditSponsorBannerPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const bannerId = params.bannerId as string;

  const [banner, setBanner] = useState<SponsorBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBanner = async () => {
      try {
        const response = await fetch(
          `/api/admin/sponsor-banners?tournament_id=${tournamentId}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'バナーの取得に失敗しました');
        }

        const targetBanner = data.banners.find(
          (b: SponsorBanner) => b.banner_id === parseInt(bannerId)
        );

        if (!targetBanner) {
          throw new Error('バナーが見つかりません');
        }

        setBanner(targetBanner);
      } catch (err) {
        console.error('バナー取得エラー:', err);
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchBanner();
  }, [tournamentId, bannerId]);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (error || !banner) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive">{error || 'バナーが見つかりません'}</p>
        </div>
        <Button asChild className="mt-4">
          <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`}>
            バナー一覧に戻る
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto py-8 px-4">
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
          <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            スポンサーバナー管理
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            バナー編集
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">バナー編集</h1>
          <p className="text-sm text-gray-500 mt-1">スポンサーバナーの情報を編集します</p>
        </div>
        <SponsorBannerForm tournamentId={tournamentId} banner={banner} mode="edit" />
      </div>
    </div>
  );
}
