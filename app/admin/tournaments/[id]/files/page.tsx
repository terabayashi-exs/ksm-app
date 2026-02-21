// app/admin/tournaments/[id]/files/page.tsx
// 管理者ファイル管理画面

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FileManagementContainer from '@/components/features/admin/FileManagementContainer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, HardDrive, Upload, Loader2, Link as LinkIcon } from 'lucide-react';

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function TournamentFilesPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [uploadFiles, setUploadFiles] = useState(0);
  const [externalLinks, setExternalLinks] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [publicCount, setPublicCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        // 大会情報と統計情報を取得
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/files/stats`);
        if (!response.ok) {
          router.push('/my?tab=admin');
          return;
        }
        const data = await response.json();

        if (data.success) {
          setTotalCount(data.total_count);
          setUploadFiles(data.upload_files);
          setExternalLinks(data.external_links);
          setTotalSize(data.total_size);
          setPublicCount(data.public_count);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [tournamentId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー部分 */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <FileText className="h-6 w-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-foreground">ファイル管理</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                大会に関連するファイルをアップロード・管理できます。公開設定で一般ユーザーへの共有も可能です。
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/my?tab=admin')}>
              ダッシュボードに戻る
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Upload className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">アップロードファイル</p>
                  <p className="text-2xl font-bold text-foreground">{uploadFiles}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <LinkIcon className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">外部URLリンク</p>
                  <p className="text-2xl font-bold text-foreground">{externalLinks}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <HardDrive className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">総容量</p>
                  <p className="text-2xl font-bold text-foreground">{formatFileSize(totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">公開中</p>
                  <p className="text-2xl font-bold text-foreground">{publicCount} / {totalCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ファイルアップロード・管理統合コンテナ */}
        <FileManagementContainer tournamentId={tournamentId} />
      </div>
    </div>
  );
}