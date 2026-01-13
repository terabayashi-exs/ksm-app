'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || 'バナーが見つかりません'}</p>
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
    <div className="container mx-auto py-8">
      <Button asChild variant="outline" className="mb-6">
        <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners`}>
          ← バナー一覧に戻る
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">バナー編集</h1>
        <p className="text-muted-foreground">{banner.banner_name}</p>
      </div>

      <SponsorBannerForm tournamentId={tournamentId} banner={banner} mode="edit" />
    </div>
  );
}
