// components/features/admin/AdminLogoUpload.tsx
// 管理者ロゴアップロード・管理コンポーネント

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, X, Image as ImageIcon, Building2, CheckCircle, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

interface LogoData {
  has_logo: boolean;
  logo_url: string | null;
  filename: string | null;
  organization_name: string | null;
}

interface ApiResponse {
  success: boolean;
  data?: LogoData;
  message?: string;
  error?: string;
}

export default function AdminLogoUpload() {
  const [logoData, setLogoData] = useState<LogoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 現在のロゴ情報を取得
  const fetchLogoData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/profile/logo');
      const result: ApiResponse = await response.json();

      if (result.success && result.data) {
        setLogoData(result.data);
        setOrganizationName(result.data.organization_name || '');
      } else {
        console.error('ロゴ情報取得失敗:', result.error);
      }
    } catch (error) {
      console.error('ロゴ情報取得エラー:', error);
      setAlert({ type: 'error', message: 'ロゴ情報の取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  };

  // ファイル選択時の処理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ファイル形式チェック
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAlert({ type: 'error', message: 'JPEG、PNG、WebPファイルのみアップロード可能です' });
      return;
    }

    // ファイルサイズチェック（5MB）
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setAlert({ type: 'error', message: 'ファイルサイズは5MB以下にしてください' });
      return;
    }

    setSelectedFile(file);

    // プレビュー画像生成
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setAlert(null);
  };

  // ファイルアップロード
  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append('logo', selectedFile);
      formData.append('organization_name', organizationName);

      const response = await fetch('/api/admin/profile/logo', {
        method: 'POST',
        body: formData,
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setAlert({ type: 'success', message: 'ロゴが正常にアップロードされました' });
        await fetchLogoData(); // 最新情報を再取得
        
        // 状態をリセット
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setAlert({ type: 'error', message: result.error || 'アップロードに失敗しました' });
      }
    } catch (error) {
      console.error('アップロードエラー:', error);
      setAlert({ type: 'error', message: 'アップロードに失敗しました' });
    } finally {
      setIsUploading(false);
    }
  };

  // ロゴ削除
  const handleDelete = async () => {
    if (!logoData?.has_logo) return;

    if (!confirm('現在のロゴを削除してもよろしいですか？')) {
      return;
    }

    try {
      setIsDeleting(true);

      const response = await fetch('/api/admin/profile/logo', {
        method: 'DELETE',
      });

      const result: ApiResponse = await response.json();

      if (result.success) {
        setAlert({ type: 'success', message: 'ロゴが正常に削除されました' });
        await fetchLogoData(); // 最新情報を再取得
      } else {
        setAlert({ type: 'error', message: result.error || '削除に失敗しました' });
      }
    } catch (error) {
      console.error('削除エラー:', error);
      setAlert({ type: 'error', message: '削除に失敗しました' });
    } finally {
      setIsDeleting(false);
    }
  };

  // キャンセル処理
  const handleCancel = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setOrganizationName(logoData?.organization_name || '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setAlert(null);
  };

  // アラート自動非表示
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // 初期データ取得
  useEffect(() => {
    fetchLogoData();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            管理者ロゴ設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">読み込み中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          管理者ロゴ設定
        </CardTitle>
        <CardDescription>
          大会カードに表示される組織ロゴを設定できます。推奨サイズ: 200x200px以下、5MB以下
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* アラート表示 */}
        {alert && (
          <Alert className={alert.type === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
            {alert.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={alert.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {alert.message}
            </AlertDescription>
          </Alert>
        )}

        {/* 現在のロゴ表示 */}
        {logoData?.has_logo && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 bg-white border rounded-lg flex items-center justify-center overflow-hidden relative">
                  <Image
                    src={logoData.logo_url!}
                    alt="現在のロゴ"
                    fill
                    className="object-contain"
                    sizes="96px"
                  />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">現在のロゴ</h3>
                  <p className="text-sm text-gray-600">ファイル名: {logoData.filename}</p>
                  {logoData.organization_name && (
                    <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                      <Building2 className="h-3 w-3" />
                      {logoData.organization_name}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {isDeleting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                ) : (
                  <X className="h-4 w-4" />
                )}
                削除
              </Button>
            </div>
          </div>
        )}

        {/* 新しいロゴアップロード */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="organization-name" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              組織名（任意）
            </Label>
            <Input
              id="organization-name"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="例: ○○スポーツクラブ"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="logo-file">ロゴファイル</Label>
            <div className="mt-1">
              <Input
                id="logo-file"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="cursor-pointer"
              />
            </div>
          </div>

          {/* プレビュー */}
          {previewUrl && (
            <div className="border rounded-lg p-4 bg-blue-50">
              <h3 className="font-medium text-gray-900 mb-3">プレビュー</h3>
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 bg-white border rounded-lg flex items-center justify-center overflow-hidden relative">
                  <Image
                    src={previewUrl}
                    alt="プレビュー"
                    fill
                    className="object-contain"
                    sizes="96px"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600">ファイル名: {selectedFile?.name}</p>
                  <p className="text-sm text-gray-600">
                    サイズ: {selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(2) : 0}MB
                  </p>
                  {organizationName && (
                    <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                      <Building2 className="h-3 w-3" />
                      {organizationName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          {selectedFile && (
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {logoData?.has_logo ? 'ロゴを更新' : 'ロゴをアップロード'}
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                キャンセル
              </Button>
            </div>
          )}
        </div>

        {/* 使用例説明 */}
        <div className="border-t pt-4">
          <h3 className="font-medium text-gray-900 mb-2">ロゴの表示場所</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• トップページの大会カード背景</li>
            <li>• 大会詳細ページのヘッダー部分</li>
            <li>• 管理者が作成した大会の識別表示</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}