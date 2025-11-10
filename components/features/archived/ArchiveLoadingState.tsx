// components/features/archived/ArchiveLoadingState.tsx
import { Card, CardContent } from '@/components/ui/card';
import { Archive, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * アーカイブ読み込み中の表示
 */
export function ArchiveLoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="flex justify-center mb-4">
              <Archive className="h-12 w-12 text-muted-foreground animate-pulse" />
            </div>
            <h2 className="text-lg font-semibold mb-2">アーカイブを読み込み中...</h2>
            <p className="text-muted-foreground">
              大会データを取得しています
            </p>
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * アーカイブエラー状態の表示
 */
interface ArchiveErrorStateProps {
  error: string;
  tournamentId: string;
  onRetry?: () => void;
}

export function ArchiveErrorState({ error, tournamentId, onRetry }: ArchiveErrorStateProps) {
  const getErrorDetails = (errorMessage: string) => {
    if (errorMessage.includes('見つかりません') || errorMessage.includes('404')) {
      return {
        title: 'アーカイブが見つかりません',
        description: 'この大会はまだアーカイブされていない可能性があります。',
        icon: <Archive className="h-12 w-12 text-amber-500" />,
        canRetry: false
      };
    }
    
    if (errorMessage.includes('401') || errorMessage.includes('権限')) {
      return {
        title: 'アクセス権限がありません',
        description: 'このアーカイブにアクセスする権限がありません。',
        icon: <AlertCircle className="h-12 w-12 text-red-500" />,
        canRetry: false
      };
    }

    return {
      title: 'アーカイブの読み込みに失敗しました',
      description: '一時的な問題の可能性があります。しばらくしてから再試行してください。',
      icon: <AlertCircle className="h-12 w-12 text-red-500" />,
      canRetry: true
    };
  };

  const errorDetails = getErrorDetails(error);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="flex justify-center mb-4">
              {errorDetails.icon}
            </div>
            <h2 className="text-lg font-semibold mb-2 text-foreground">
              {errorDetails.title}
            </h2>
            <p className="text-muted-foreground mb-4">
              {errorDetails.description}
            </p>
            
            <div className="text-sm text-muted-foreground mb-6 p-3 bg-muted rounded-lg">
              <p className="font-medium mb-1">詳細エラー:</p>
              <p className="break-words">{error}</p>
              <p className="mt-2">大会ID: {tournamentId}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={() => window.history.back()}>
                戻る
              </Button>
              
              {errorDetails.canRetry && onRetry && (
                <Button onClick={onRetry} className="flex items-center">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  再試行
                </Button>
              )}
              
              <Button variant="outline" asChild>
                <Link href="/public/tournaments">
                  大会一覧へ
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * アーカイブ情報バナー
 */
interface ArchiveInfoBannerProps {
  archivedAt: string;
  archivedBy: string;
  source?: 'blob' | 'database';
  fileSize?: number;
}

export function ArchiveInfoBanner({ archivedAt, archivedBy, source, fileSize }: ArchiveInfoBannerProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSourceInfo = (source?: string) => {
    switch (source) {
      case 'blob':
        return { label: 'Blob Storage', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'database':
        return { label: 'Database', color: 'bg-gray-100 text-gray-800 border-gray-200' };
      default:
        return { label: 'Unknown', color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  const sourceInfo = getSourceInfo(source);

  return (
    <Card className="mb-6 border-l-4 border-l-purple-500 bg-purple-50/50">
      <CardContent className="py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-4">
            <Archive className="h-5 w-5 text-purple-600" />
            <div className="text-sm">
              <p className="font-medium text-purple-900">
                アーカイブ済みデータ
              </p>
              <p className="text-purple-700">
                {formatDate(archivedAt)} に {archivedBy} によってアーカイブされました
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-md text-xs font-medium border ${sourceInfo.color}`}>
              {sourceInfo.label}
            </span>
            {fileSize && (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                {formatFileSize(fileSize)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}