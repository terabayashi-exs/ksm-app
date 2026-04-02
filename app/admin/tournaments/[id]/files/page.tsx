// app/admin/tournaments/[id]/files/page.tsx
// 管理者ファイル・お知らせ管理画面

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FileManagementContainer from '@/components/features/admin/FileManagementContainer';
import TournamentNoticeManagement from '@/components/features/tournament/TournamentNoticeManagement';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, HardDrive, Upload, Loader2, Link as LinkIcon, ChevronRight, Home, Bell } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/layout/Header';

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

type TabType = 'notices' | 'files' | 'links';

export default function TournamentFilesPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [uploadFiles, setUploadFiles] = useState(0);
  const [externalLinks, setExternalLinks] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [publicCount, setPublicCount] = useState(0);
  const [totalNotices, setTotalNotices] = useState(0);
  const [activeNotices, setActiveNotices] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('notices');

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/files/stats`);
      if (!response.ok) {
        router.push('/my?tab=admin');
        return;
      }
      const data = await response.json();

      if (data.success) {
        setTournamentName(data.tournament_name || '');
        setTotalCount(data.total_count);
        setUploadFiles(data.upload_files);
        setExternalLinks(data.external_links);
        setTotalSize(data.total_size);
        setPublicCount(data.public_count);
        setTotalNotices(data.total_notices);
        setActiveNotices(data.active_notices);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'notices', label: 'お知らせ', count: totalNotices },
    { key: 'files', label: 'アップロードファイル', count: uploadFiles },
    { key: 'links', label: '外部URLリンク', count: externalLinks },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ファイル管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            大会に関連するお知らせ・ファイル・外部リンクを管理できます。
          </p>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Bell className="h-7 w-7 text-amber-600 shrink-0" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-gray-500">お知らせ</p>
                  <p className="text-xl font-bold text-gray-900">{activeNotices}<span className="text-sm font-normal text-gray-400"> / {totalNotices}</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <Upload className="h-7 w-7 text-primary shrink-0" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-gray-500">アップロード</p>
                  <p className="text-xl font-bold text-gray-900">{uploadFiles}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <LinkIcon className="h-7 w-7 text-purple-600 shrink-0" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-gray-500">外部リンク</p>
                  <p className="text-xl font-bold text-gray-900">{externalLinks}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <HardDrive className="h-7 w-7 text-green-600 shrink-0" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-gray-500">総容量</p>
                  <p className="text-xl font-bold text-gray-900">{formatFileSize(totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <FileText className="h-7 w-7 text-orange-600 shrink-0" />
                <div className="ml-3">
                  <p className="text-xs font-medium text-gray-500">公開中</p>
                  <p className="text-xl font-bold text-gray-900">{publicCount}<span className="text-sm font-normal text-gray-400"> / {totalCount}</span></p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* タブ切り替え */}
        <div className="border-b mb-6">
          <div className="flex gap-0 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'notices' && (
          <TournamentNoticeManagement tournamentId={tournamentId} tournamentName={tournamentName} />
        )}
        {(activeTab === 'files' || activeTab === 'links') && (
          <FileManagementContainer tournamentId={tournamentId} onStatsChange={fetchStats} filterType={activeTab === 'files' ? 'upload' : 'external'} />
        )}
      </div>
    </div>
  );
}
