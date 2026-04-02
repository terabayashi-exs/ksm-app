// components/features/tournament/PublicFilesList.tsx
// お知らせ・大会資料等の統合表示コンポーネント

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FileText, Calendar, ExternalLink, RefreshCw, Link as LinkIcon, Bell, Maximize2 } from 'lucide-react';
import type { LinkType } from '@/lib/types/tournament-files';

interface PublicFile {
  file_id: number;
  link_type: LinkType;
  file_title: string;
  file_description?: string;
  original_filename: string;
  blob_url: string;
  external_url?: string;
  file_size: number;
  upload_order: number;
  uploaded_at: string;
  display_date?: string;
}

interface Notice {
  tournament_notice_id: number;
  content: string;
  updated_at: string | null;
}

interface PublicFilesData {
  files: PublicFile[];
  total_files: number;
}

interface PublicFilesListProps {
  tournamentId: number;
  showTitle?: boolean;
  maxFiles?: number;
  layout?: 'card' | 'compact';
}

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 日付をフォーマット
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/** お知らせカード（溢れ検知 + ダイアログ付き） */
function NoticeCard({ notice }: { notice: Notice }) {
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > el.clientHeight);
    }
  }, [notice.content]);

  return (
    <Card className="hover:shadow-md transition-shadow border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center">
            <Bell className="h-5 w-5 mr-2 text-amber-600 flex-shrink-0" />
            <span className="line-clamp-1">お知らせ</span>
          </div>
          {isOverflowing && (
            <Dialog>
              <DialogTrigger asChild>
                <button className="ml-2 text-gray-400 hover:text-amber-600 transition-colors flex-shrink-0">
                  <Maximize2 className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Bell className="h-5 w-5 mr-2 text-amber-600" />
                    お知らせ
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {notice.content}
                </p>
                {notice.updated_at && (
                  <div className="text-xs text-gray-500 flex items-center mt-3">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(notice.updated_at)}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p
          ref={contentRef}
          className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3 mb-3"
        >
          {notice.content}
        </p>
        {notice.updated_at && (
          <div className="text-xs text-gray-500 flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            {formatDate(notice.updated_at)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PublicFilesList({
  tournamentId,
  showTitle = true,
  maxFiles,
  layout = 'card'
}: PublicFilesListProps) {
  const [data, setData] = useState<PublicFilesData | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ファイル一覧とお知らせを取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [filesRes, noticesRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/public-files`, { cache: 'no-store' }),
        fetch(`/api/tournaments/${tournamentId}/notices`, { cache: 'no-store' }),
      ]);

      const filesResult = await filesRes.json();
      if (filesResult.success) {
        let files = filesResult.data.files;
        if (maxFiles && files.length > maxFiles) {
          files = files.slice(0, maxFiles);
        }
        setData({ files, total_files: filesResult.data.total_files });
      } else {
        setError(filesResult.error || 'ファイル一覧の取得に失敗しました');
      }

      const noticesResult = await noticesRes.json();
      if (noticesResult.success) {
        setNotices(noticesResult.notices || []);
      }
    } catch (err) {
      console.error('公開ファイル取得エラー:', err);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, maxFiles]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-500 mr-2" />
        <span className="text-sm text-gray-500">読み込み中...</span>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="text-center py-6">
        <div className="text-sm text-red-600 mb-2">{error}</div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          再試行
        </Button>
      </div>
    );
  }

  const hasFiles = data && data.files.length > 0;
  const hasNotices = notices.length > 0;

  // どちらもない場合は何も表示しない
  if (!hasFiles && !hasNotices) {
    return null;
  }

  // ファイルをアップロード→外部リンクの順に並べる
  const uploadFiles = data?.files.filter(f => f.link_type === 'upload') || [];
  const externalFiles = data?.files.filter(f => f.link_type === 'external') || [];

  // カードレイアウト
  if (layout === 'card') {
    return (
      <div className="space-y-4">
        {showTitle && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <FileText className="h-5 w-5 mr-2 text-blue-600" />
              📎 お知らせ・大会資料等
            </h3>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* お知らせカード */}
          {notices.map((notice) => (
            <NoticeCard key={`notice-${notice.tournament_notice_id}`} notice={notice} />
          ))}

          {/* 大会資料（アップロードファイル）カード */}
          {uploadFiles.map((file) => (
            <Card key={`file-${file.file_id}`} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <FileText className="h-5 w-5 mr-2 text-blue-600 flex-shrink-0" />
                    <span className="line-clamp-2">{file.file_title}</span>
                  </div>
                  <a
                    href={file.blob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {file.file_description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {file.file_description}
                  </p>
                )}
                <div className="text-xs text-gray-500 space-y-1">
                  <div>📏 {formatFileSize(file.file_size)}</div>
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {file.display_date || formatDate(file.uploaded_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* 外部リンクカード */}
          {externalFiles.map((file) => (
            <Card key={`file-${file.file_id}`} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <LinkIcon className="h-5 w-5 mr-2 text-blue-600 flex-shrink-0" />
                    <span className="line-clamp-2">{file.file_title}</span>
                  </div>
                  <a
                    href={file.external_url || file.blob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {file.file_description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {file.file_description}
                  </p>
                )}
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex items-center">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    外部リンク
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {file.display_date || formatDate(file.uploaded_at)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // コンパクトレイアウト
  return (
    <div className="space-y-3">
      {showTitle && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            📎 お知らせ・大会資料等
          </h3>
        </div>
      )}

      <div className="space-y-2">
        {/* お知らせ */}
        {notices.map((notice) => (
          <div
            key={`notice-${notice.tournament_notice_id}`}
            className="flex items-center p-3 border border-amber-200 bg-amber-50/30 rounded-lg"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <Bell className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{notice.content}</p>
                {notice.updated_at && (
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDate(notice.updated_at)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* 大会資料（アップロードファイル） */}
        {uploadFiles.map((file) => (
          <div
            key={`file-${file.file_id}`}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{file.file_title}</div>
                <div className="text-sm text-gray-500">
                  {formatFileSize(file.file_size)} • {file.display_date || formatDate(file.uploaded_at)}
                </div>
              </div>
            </div>
            <a
              href={file.blob_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ))}

        {/* 外部リンク */}
        {externalFiles.map((file) => (
          <div
            key={`file-${file.file_id}`}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <LinkIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{file.file_title}</div>
                <div className="text-sm text-gray-500">
                  外部リンク • {file.display_date || formatDate(file.uploaded_at)}
                </div>
              </div>
            </div>
            <a
              href={file.external_url || file.blob_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
