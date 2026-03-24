// app/tournaments/[id]/archived/page.tsx
import type { Metadata } from 'next';
import { getTournamentNameForMetadata } from '@/lib/metadata-helpers';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import BackButton from '@/components/ui/back-button';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ArrowLeft, Archive } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ArchiveLoadingState } from '@/components/features/archived/ArchiveLoadingState';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';
import { BlobStorage } from '@/lib/blob-storage';
import { isBlobStorageAvailable } from '@/lib/blob-config';
import { ArchivedHtmlViewer } from './ArchivedHtmlViewer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await getTournamentNameForMetadata(id);
  return { title: name ? `${name} (アーカイブ)` : 'アーカイブ' };
}

// BlobにHTMLアーカイブが存在するかチェック
async function checkHtmlArchiveExists(id: string): Promise<boolean> {
  try {
    if (!isBlobStorageAvailable()) return false;
    const htmlPath = `tournaments/${id}/archive.html`;
    return await BlobStorage.exists(htmlPath);
  } catch {
    return false;
  }
}

// アーカイブデータから大会詳細を取得する関数（API経由でBlob対応）- フォールバック用
async function getArchivedTournamentDetail(id: string) {
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    throw new Error('有効な大会IDを指定してください');
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/tournaments/${tournamentId}/archived-view`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('アーカイブデータが見つかりません');
      }
      throw new Error(`アーカイブデータの取得に失敗しました: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'アーカイブデータの取得に失敗しました');
    }

    return result.data;
  } catch (error) {
    console.error('アーカイブデータ取得エラー:', error);
    throw error;
  }
}

// メインコンテンツコンポーネント
async function ArchivedTournamentContent({ params }: PageProps) {
  const resolvedParams = await params;
  const tournamentId = resolvedParams.id;

  // まずHTML版アーカイブの存在をチェック
  const hasHtmlArchive = await checkHtmlArchiveExists(tournamentId);

  if (hasHtmlArchive) {
    // HTML版: iframe で表示
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="mb-4">
            <div className="flex items-center gap-4">
              <BackButton />
              <Button variant="ghost" asChild>
                <Link href="/" className="flex items-center text-gray-500 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  TOPページに戻る
                </Link>
              </Button>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-2">
            <Archive className="h-4 w-4 text-purple-600" />
            <span className="text-sm text-gray-500">
              アーカイブ表示（静的HTML版）
            </span>
          </div>

          <ArchivedHtmlViewer tournamentId={tournamentId} />
        </div>
        <Footer />
      </div>
    );
  }

  // フォールバック: 従来のJSON版アーカイブ表示
  const archived = await getArchivedTournamentDetail(tournamentId);

  if (!archived) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">アーカイブデータが見つかりません</h1>
            <p className="text-gray-500 mb-8">指定された大会のアーカイブデータが存在しません。</p>
            <Button asChild>
              <Link href="/">TOPページに戻る</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // アーカイブUIバージョンを取得
  const parsedId = parseInt(tournamentId);
  const uiVersion = await ArchiveVersionManager.getArchiveUIVersion(parsedId);
  const versionInfo = ArchiveVersionManager.getVersionInfo(uiVersion);

  console.log(`🔍 Archive UI Version Debug (Tournament ID: ${parsedId}):`, {
    uiVersion,
    versionInfo: versionInfo ? {
      version: versionInfo.version,
      features: versionInfo.features,
      component_path: versionInfo.component_path
    } : 'undefined'
  });

  // バージョンに応じたコンポーネントの動的読み込み
  let VersionedComponent;

  try {
    if (uiVersion === '1.0') {
      const { ArchivedLayout_v1 } = await import('@/components/features/archived/v1.0/ArchivedLayout_v1');
      VersionedComponent = ArchivedLayout_v1;
    } else if (uiVersion === '2.0') {
      const { ArchivedLayout_v2 } = await import('@/components/features/archived/v2.0/ArchivedLayout_v2');
      VersionedComponent = ArchivedLayout_v2;
    } else {
      console.warn(`未対応のUIバージョン: ${uiVersion}, デフォルトバージョン(v1.0)を使用します`);
      const { ArchivedLayout_v1 } = await import('@/components/features/archived/v1.0/ArchivedLayout_v1');
      VersionedComponent = ArchivedLayout_v1;
    }
  } catch (error) {
    console.error(`アーカイブコンポーネント読み込みエラー (バージョン ${uiVersion}):`, error);
    return renderInlineError(archived);
  }

  return (
    <VersionedComponent
      archived={archived}
      uiVersion={uiVersion}
      versionInfo={versionInfo}
    />
  );
}

// フォールバック用のインラインレンダリング関数
function renderInlineError(archived: { tournament: { tournament_name: string }; archived_at?: string }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center text-gray-500 hover:text-gray-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          </div>
        </div>
        <div className="mb-8">
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center">
              <Archive className="h-5 w-5 text-destructive mr-2" />
              <div className="flex-1">
                <p className="font-medium text-destructive">アーカイブコンポーネント読み込みエラー</p>
                <p className="text-sm text-destructive mt-1">
                  アーカイブ表示コンポーネントの読み込みに失敗しました。管理者にお問い合わせください。
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{archived.tournament.tournament_name}</h1>
          <p className="text-gray-500">アーカイブ日時: {formatDate(archived.archived_at as string)}</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function ArchivedTournamentPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ArchiveLoadingState />}>
      <ArchivedTournamentContent params={params} />
    </Suspense>
  );
}
