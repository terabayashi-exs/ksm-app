// components/features/tournament/PublicFilesList.tsx
// 大会公開ファイル一覧表示コンポーネント

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Calendar, ExternalLink, RefreshCw, Link as LinkIcon } from 'lucide-react';
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

export default function PublicFilesList({ 
  tournamentId, 
  showTitle = true, 
  maxFiles,
  layout = 'card'
}: PublicFilesListProps) {
  const [data, setData] = useState<PublicFilesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ファイル一覧を取得
  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/tournaments/${tournamentId}/public-files`, {
        cache: 'no-store'
      });
      
      const result = await response.json();

      if (result.success) {
        let files = result.data.files;
        
        // maxFiles制限適用
        if (maxFiles && files.length > maxFiles) {
          files = files.slice(0, maxFiles);
        }
        
        setData({
          files,
          total_files: result.data.total_files
        });
      } else {
        setError(result.error || 'ファイル一覧の取得に失敗しました');
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
    fetchFiles();
  }, [fetchFiles]);

  // ローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">ファイルを読み込み中...</span>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="text-center py-6">
        <div className="text-sm text-red-600 mb-2">{error}</div>
        <Button variant="outline" size="sm" onClick={fetchFiles}>
          <RefreshCw className="h-4 w-4 mr-2" />
          再試行
        </Button>
      </div>
    );
  }

  // ファイルがない場合は何も表示しない
  if (!data || data.files.length === 0) {
    return null;
  }

  // カードレイアウト
  if (layout === 'card') {
    return (
      <div className="space-y-4">
        {showTitle && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <FileText className="h-5 w-5 mr-2 text-blue-600" />
              📎 大会資料
            </h3>
            {maxFiles && data.total_files > maxFiles && (
              <span className="text-sm text-muted-foreground">
                {maxFiles}件表示 / 全{data.total_files}件
              </span>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.files.map((file) => (
            <Card key={file.file_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-start justify-between">
                  <div className="flex items-center">
                    {file.link_type === 'external' ? (
                      <LinkIcon className="h-5 w-5 mr-2 text-blue-600 flex-shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 mr-2 text-blue-600 flex-shrink-0" />
                    )}
                    <span className="line-clamp-2">{file.file_title}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {file.file_description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {file.file_description}
                  </p>
                )}

                <div className="text-xs text-muted-foreground space-y-1 mb-4">
                  {file.link_type === 'external' ? (
                    <>
                      <div className="flex items-center">
                        <LinkIcon className="h-3 w-3 mr-1" />
                        外部リンク
                      </div>
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(file.uploaded_at)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>📄 {file.original_filename}</div>
                      <div>📏 {formatFileSize(file.file_size)}</div>
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(file.uploaded_at)}
                      </div>
                    </>
                  )}
                </div>

                {file.link_type === 'external' ? (
                  <Button
                    asChild
                    size="sm"
                    className="w-full"
                  >
                    <a
                      href={file.external_url || file.blob_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      リンクを開く
                    </a>
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="flex-1"
                    >
                      <a
                        href={file.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={file.original_filename}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        ダウンロード
                      </a>
                    </Button>

                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                    >
                      <a
                        href={file.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                )}
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
            📎 大会資料
          </h3>
          {maxFiles && data.total_files > maxFiles && (
            <span className="text-sm text-muted-foreground">
              {maxFiles}件表示 / 全{data.total_files}件
            </span>
          )}
        </div>
      )}
      
      <div className="space-y-2">
        {data.files.map((file) => (
          <div
            key={file.file_id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {file.link_type === 'external' ? (
                <LinkIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
              ) : (
                <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{file.file_title}</div>
                <div className="text-sm text-muted-foreground">
                  {file.link_type === 'external'
                    ? `外部リンク • ${formatDate(file.uploaded_at)}`
                    : `${formatFileSize(file.file_size)} • ${formatDate(file.uploaded_at)}`
                  }
                </div>
                {file.file_description && (
                  <div className="text-sm text-muted-foreground truncate">
                    {file.file_description}
                  </div>
                )}
              </div>
            </div>

            {file.link_type === 'external' ? (
              <Button
                asChild
                size="sm"
              >
                <a
                  href={file.external_url || file.blob_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  開く
                </a>
              </Button>
            ) : (
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                >
                  <a
                    href={file.blob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>

                <Button
                  asChild
                  size="sm"
                >
                  <a
                    href={file.blob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.original_filename}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    ダウンロード
                  </a>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}