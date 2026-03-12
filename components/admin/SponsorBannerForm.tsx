'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Image from 'next/image';
import {
  type SponsorBanner,
  type CreateSponsorBannerInput,
  BANNER_POSITIONS,
  BANNER_SIZES,
  TARGET_TABS,
  getPositionLabel,
  getTargetTabLabel,
  getBannerSizeLabel,
  getRecommendedSizeText,
  isPositionValidForSize,
  MAX_FILE_SIZE,
  type BannerSize,
} from '@/lib/sponsor-banner-specs';

interface SponsorBannerFormProps {
  tournamentId: string;
  banner?: SponsorBanner;
  mode: 'create' | 'edit';
}

export default function SponsorBannerForm({ tournamentId, banner, mode }: SponsorBannerFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    banner_name: banner?.banner_name || '',
    banner_url: banner?.banner_url || '',
    display_position: banner?.display_position || BANNER_POSITIONS.TOP,
    target_tab: banner?.target_tab || TARGET_TABS.ALL,
    banner_size: (banner?.banner_size || BANNER_SIZES.LARGE) as BannerSize,
    display_order: banner?.display_order?.toString() || '0',
    is_active: banner?.is_active === 0 ? '0' : '1',
    start_date: banner?.start_date || '',
    end_date: banner?.end_date || '',
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(banner?.image_blob_url || '');
  const [uploadedBlobUrl, setUploadedBlobUrl] = useState<string>(banner?.image_blob_url || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ファイル選択時の処理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      alert(`ファイルサイズが大きすぎます。最大${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MBまでです。`);
      return;
    }

    // 画像形式チェック
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    setImageFile(file);

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // フォーム送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.banner_name.trim()) {
      alert('バナー名を入力してください');
      return;
    }

    // 新規作成時は画像が必須
    if (mode === 'create' && !imageFile && !uploadedBlobUrl) {
      alert('画像ファイルを選択してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // 未アップロードの画像がある場合は先にアップロード
      let blobUrl = uploadedBlobUrl;
      if (imageFile && !uploadedBlobUrl) {
        console.log('📤 画像を自動アップロード中...');
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('tournament_id', tournamentId);

        const uploadResponse = await fetch('/api/admin/sponsor-banners/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadData.success) {
          throw new Error(uploadData.error || '画像のアップロードに失敗しました');
        }

        blobUrl = uploadData.data.blob_url;
        setUploadedBlobUrl(blobUrl);
        console.log('✅ 画像アップロード完了:', blobUrl);
      }

      // 編集モードで画像が変更されていない場合は既存のBlobURLを使用
      if (mode === 'edit' && !blobUrl) {
        blobUrl = banner?.image_blob_url || '';
      }

      const payload: CreateSponsorBannerInput = {
        tournament_id: parseInt(tournamentId),
        banner_name: formData.banner_name.trim(),
        banner_url: formData.banner_url.trim() || undefined,
        image_blob_url: blobUrl,
        image_filename: imageFile?.name || banner?.image_filename || undefined,
        file_size: imageFile?.size || banner?.file_size || undefined,
        display_position: formData.display_position,
        target_tab: formData.target_tab,
        banner_size: formData.banner_size,
        display_order: parseInt(formData.display_order) || 0,
        is_active: parseInt(formData.is_active) as 0 | 1,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
      };

      console.log('📤 バナー作成リクエスト送信:', payload);

      let response;
      if (mode === 'create') {
        response = await fetch('/api/admin/sponsor-banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch(`/api/admin/sponsor-banners/${banner?.banner_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      console.log('📥 レスポンス受信:', { status: response.status, ok: response.ok });

      const data = await response.json();
      console.log('📋 レスポンスデータ:', data);

      if (!response.ok) {
        throw new Error(data.error || 'バナーの保存に失敗しました');
      }

      alert(mode === 'create' ? 'バナーを作成しました' : 'バナーを更新しました');
      console.log('🔄 一覧ページに遷移します');
      router.push(`/admin/tournaments/${tournamentId}/sponsor-banners`);
    } catch (err) {
      console.error('バナー保存エラー:', err);
      setError(err instanceof Error ? err.message : 'バナーの保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // バナーサイズ変更時の処理（小バナーでサイドバーが選択されている場合はtopに変更）
  const handleBannerSizeChange = (size: BannerSize) => {
    const newFormData = { ...formData, banner_size: size };

    // 小バナーでサイドバーが選択されている場合、タブ上部に変更
    if (size === BANNER_SIZES.SMALL && formData.display_position === BANNER_POSITIONS.SIDEBAR) {
      newFormData.display_position = BANNER_POSITIONS.TOP;
    }

    setFormData(newFormData);
  };

  const recommendedSizeText = getRecommendedSizeText(formData.banner_size, formData.display_position);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* 画像アップロード */}
      <Card>
        <CardHeader>
          <CardTitle>バナー画像 *</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              画像を選択
            </Button>
            {imageFile && (
              <span className="ml-2 text-sm text-muted-foreground">{imageFile.name}</span>
            )}
          </div>

          {imagePreview && (
            <div className="space-y-2">
              <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                <Image
                  src={imagePreview}
                  alt="プレビュー"
                  fill
                  className="object-contain"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                バナー作成時に自動的にアップロードされます
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* バナー情報 */}
      <Card>
        <CardHeader>
          <CardTitle>バナー情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="banner_name">バナー名 *</Label>
            <Input
              id="banner_name"
              value={formData.banner_name}
              onChange={(e) => setFormData({ ...formData, banner_name: e.target.value })}
              placeholder="例: スポンサー企業名"
              required
            />
          </div>

          <div>
            <Label htmlFor="banner_url">リンクURL（オプション）</Label>
            <Input
              id="banner_url"
              type="url"
              value={formData.banner_url}
              onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
              placeholder="https://example.com"
            />
            <p className="text-sm text-muted-foreground mt-1">
              バナークリック時に遷移するURLを入力してください
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 表示設定 */}
      <Card>
        <CardHeader>
          <CardTitle>表示設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* バナーサイズ選択 */}
          <div>
            <Label htmlFor="banner_size">バナーサイズ *</Label>
            <Select
              value={formData.banner_size}
              onValueChange={(value) => handleBannerSizeChange(value as BannerSize)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BANNER_SIZES.LARGE}>
                  {getBannerSizeLabel(BANNER_SIZES.LARGE)}（1200×200px）- 全位置対応
                </SelectItem>
                <SelectItem value={BANNER_SIZES.SMALL}>
                  {getBannerSizeLabel(BANNER_SIZES.SMALL)}（250×64px）- タブ上部・タブ下部のみ
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
              <p className="text-sm text-primary">
                {formData.banner_size === BANNER_SIZES.LARGE ? (
                  <>
                    <span className="font-semibold">大バナー：</span>
                    1枚ずつ縦に表示されます。全ての表示位置（タブ上部・サイドバー・タブ下部）に配置可能です。
                  </>
                ) : (
                  <>
                    <span className="font-semibold">小バナー：</span>
                    画面幅に応じて複数列で横に並びます。タブ上部とタブ下部のみ配置可能です（サイドバーには配置できません）。
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="display_position">表示位置 *</Label>
              <Select
                value={formData.display_position}
                onValueChange={(value) =>
                  setFormData({ ...formData, display_position: value as typeof BANNER_POSITIONS[keyof typeof BANNER_POSITIONS] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(BANNER_POSITIONS).map((position) => {
                    const isDisabled = !isPositionValidForSize(formData.banner_size, position);
                    return (
                      <SelectItem
                        key={position}
                        value={position}
                        disabled={isDisabled}
                      >
                        {getPositionLabel(position)}
                        {isDisabled && ' (小バナーは選択不可)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {recommendedSizeText && (
                <p className="text-sm text-muted-foreground mt-1">
                  推奨サイズ: {recommendedSizeText}
                </p>
              )}
              {formData.display_position === 'sidebar' && (
                <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                  <p className="text-sm text-primary">
                    <span className="font-semibold">📱 表示に関する注意：</span>
                    <br />
                    サイドバーはPC（デスクトップ）表示のみで表示されます。スマートフォンやタブレットでは表示されません。
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="target_tab">表示タブ *</Label>
              <Select
                value={formData.target_tab}
                onValueChange={(value) =>
                  setFormData({ ...formData, target_tab: value as typeof TARGET_TABS[keyof typeof TARGET_TABS] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TARGET_TABS).map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {getTargetTabLabel(tab)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="display_order">表示順序</Label>
              <Input
                id="display_order"
                type="number"
                min="0"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              />
              <p className="text-sm text-muted-foreground mt-1">
                数値が小さいほど先に表示されます
              </p>
            </div>

            <div>
              <Label htmlFor="is_active">表示状態</Label>
              <Select
                value={formData.is_active}
                onValueChange={(value) => setFormData({ ...formData, is_active: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">有効</SelectItem>
                  <SelectItem value="0">無効</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">表示開始日（オプション）</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">表示終了日（オプション）</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* アクションボタン */}
      <div className="flex gap-4">
        <Button type="submit" variant="outline" disabled={submitting}>
          {submitting
            ? '保存中...'
            : mode === 'create'
              ? 'バナーを作成'
              : 'バナーを更新'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/admin/tournaments/${tournamentId}/sponsor-banners`)}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
