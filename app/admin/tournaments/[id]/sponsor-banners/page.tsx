'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import Image from 'next/image';
import {
  type SponsorBanner,
  getPositionLabel,
  getTargetTabLabel,
  getBannerSizeLabel,
  getRecommendedSizeText,
  isBannerDisplayable,
  sortBannersByDisplayOrder,
  BANNER_SIZES,
} from '@/lib/sponsor-banner-specs';

export default function SponsorBannersPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [banners, setBanners] = useState<SponsorBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // バナー一覧を取得
  const fetchBanners = useCallback(async () => {
    try {
      setLoading(true);
      console.log('📥 バナー一覧取得開始:', { tournamentId });
      const response = await fetch(`/api/admin/sponsor-banners?tournament_id=${tournamentId}`);
      console.log('📡 レスポンス受信:', { status: response.status, ok: response.ok });

      const data = await response.json();
      console.log('📋 取得データ:', data);

      if (!response.ok) {
        throw new Error(data.error || 'バナーの取得に失敗しました');
      }

      const sortedBanners = sortBannersByDisplayOrder(data.banners);
      console.log('✅ バナー取得完了:', { count: sortedBanners.length });
      setBanners(sortedBanners);
    } catch (err) {
      console.error('バナー取得エラー:', err);
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // バナー削除
  const handleDelete = async (bannerId: number) => {
    if (!confirm('このバナーを削除してもよろしいですか？')) {
      return;
    }

    try {
      setDeleting(bannerId);
      const response = await fetch(`/api/admin/sponsor-banners/${bannerId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'バナーの削除に失敗しました');
      }

      alert('バナーを削除しました');
      fetchBanners();
    } catch (err) {
      console.error('バナー削除エラー:', err);
      alert(err instanceof Error ? err.message : 'バナーの削除に失敗しました');
    } finally {
      setDeleting(null);
    }
  };

  // 表示状態切り替え
  const toggleActive = async (banner: SponsorBanner) => {
    try {
      const response = await fetch(`/api/admin/sponsor-banners/${banner.banner_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_active: banner.is_active === 1 ? 0 : 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '更新に失敗しました');
      }

      fetchBanners();
    } catch (err) {
      console.error('更新エラー:', err);
      alert(err instanceof Error ? err.message : '更新に失敗しました');
    }
  };

  // 位置ごとにグループ化
  const groupedBanners = banners.reduce(
    (acc, banner) => {
      if (!acc[banner.display_position]) {
        acc[banner.display_position] = [];
      }
      acc[banner.display_position].push(banner);
      return acc;
    },
    {} as Record<string, SponsorBanner[]>
  );

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Button asChild variant="outline" className="mb-4">
          <Link href="/admin">← 管理者ダッシュボードに戻る</Link>
        </Button>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">スポンサーバナー管理</h1>
            <p className="text-muted-foreground">
              部門詳細画面に表示するスポンサーバナーを管理します
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners/create`}>
              + バナー追加
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* 推奨サイズ情報 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>推奨バナーサイズ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="font-semibold mb-2">大バナー（1200×200px）</div>
              <p className="text-sm text-muted-foreground">
                全ての表示位置（タブ上部・サイドバー・タブ下部）に配置可能。1枚ずつ縦に表示されます。
              </p>
            </div>
            <div>
              <div className="font-semibold mb-2">小バナー（250×64px）</div>
              <p className="text-sm text-muted-foreground">
                タブ上部・タブ下部のみ配置可能。画面幅に応じて複数列で横に並びます。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* バナー一覧 */}
      {banners.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <p>登録されているバナーはありません</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href={`/admin/tournaments/${tournamentId}/sponsor-banners/create`}>
                  最初のバナーを追加
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(['top', 'sidebar', 'bottom'] as const).map((position) => {
            const positionBanners = groupedBanners[position] || [];
            if (positionBanners.length === 0) return null;

            return (
              <Card key={position}>
                <CardHeader>
                  <CardTitle>{getPositionLabel(position)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {positionBanners.map((banner) => {
                      const isDisplayable = isBannerDisplayable(banner);
                      return (
                        <div
                          key={banner.banner_id}
                          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex gap-4">
                            {/* バナー画像プレビュー */}
                            <div className="flex-shrink-0 w-48 h-24 relative bg-gray-100 rounded overflow-hidden">
                              <Image
                                src={banner.image_blob_url}
                                alt={banner.banner_name}
                                fill
                                className="object-contain"
                              />
                            </div>

                            {/* バナー情報 */}
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h3 className="font-semibold text-lg">{banner.banner_name}</h3>
                                  {banner.banner_url && (
                                    <a
                                      href={banner.banner_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      {banner.banner_url}
                                    </a>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Badge variant={banner.banner_size === BANNER_SIZES.LARGE ? 'default' : 'secondary'}>
                                    {getBannerSizeLabel(banner.banner_size)}
                                  </Badge>
                                  <Badge variant={banner.is_active ? 'default' : 'secondary'}>
                                    {banner.is_active ? '有効' : '無効'}
                                  </Badge>
                                  {!isDisplayable && (
                                    <Badge variant="outline" className="border-yellow-400 text-yellow-700">
                                      期間外
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                                <div>サイズ: {getRecommendedSizeText(banner.banner_size, banner.display_position)}</div>
                                <div>表示タブ: {getTargetTabLabel(banner.target_tab)}</div>
                                <div>表示順序: {banner.display_order}</div>
                                {banner.start_date && (
                                  <div>開始日: {banner.start_date}</div>
                                )}
                                {banner.end_date && <div>終了日: {banner.end_date}</div>}
                                <div>クリック数: {banner.click_count}</div>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => toggleActive(banner)}
                                >
                                  {banner.is_active ? '無効化' : '有効化'}
                                </Button>
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/admin/tournaments/${tournamentId}/sponsor-banners/${banner.banner_id}/edit`}
                                  >
                                    編集
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={() => handleDelete(banner.banner_id)}
                                  disabled={deleting === banner.banner_id}
                                >
                                  {deleting === banner.banner_id ? '削除中...' : '削除'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
