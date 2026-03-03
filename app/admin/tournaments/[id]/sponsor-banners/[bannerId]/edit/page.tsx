'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-_xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">バナー編集</h1>
            <p className="text-sm text-white/70 mt-1">スポンサーバナーの情報を編集します</p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              バナー一覧に戻る
            </Link>
          </Button>
        </div>
        <SponsorBannerForm tournamentId={tournamentId} banner={banner} mode="edit" />
      </div>
    </div>
  );
}
