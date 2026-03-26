// app/admin/tournaments/[id]/files/page.tsx
// 管理者ファイル管理画面

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FileManagementContainer from '@/components/features/admin/FileManagementContainer';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, HardDrive, Upload, Loader2, Link as LinkIcon, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー部分 */}
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
              <div className="flex items-center space-x-3 mb-2">
                <FileText className="h-6 w-6 text-white" />
                <h1 className="text-2xl font-bold text-white">ファイル管理</h1>
              </div>
              <p className="text-sm text-white/70">
                大会に関連するファイルをアップロード・管理できます。公開設定で一般ユーザーへの共有も可能です。
              </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            ファイル管理
          </span>
        </nav>

        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Upload className="h-8 w-8 text-primary" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">アップロードファイル</p>
                  <p className="text-2xl font-bold text-gray-900">{uploadFiles}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <LinkIcon className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">外部URLリンク</p>
                  <p className="text-2xl font-bold text-gray-900">{externalLinks}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <HardDrive className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">総容量</p>
                  <p className="text-2xl font-bold text-gray-900">{formatFileSize(totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">公開中</p>
                  <p className="text-2xl font-bold text-gray-900">{publicCount} / {totalCount}</p>
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