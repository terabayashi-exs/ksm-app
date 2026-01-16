// app/admin/tournaments/[id]/files/page.tsx
// 管理者ファイル管理画面

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Header from '@/components/layout/Header';
import FileManagementContainer from '@/components/features/admin/FileManagementContainer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, FileText, HardDrive, Upload } from 'lucide-react';

// ファイルサイズを人間が読みやすい形式に変換
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface TournamentFilesPageProps {
  params: Promise<{ id: string }>;
}

export default async function TournamentFilesPage({ params }: TournamentFilesPageProps) {
  // 認証チェック
  const session = await auth();
  if (!session) {
    redirect('/auth/login');
  }

  const { id } = await params;
  const tournamentId = parseInt(id);

  if (isNaN(tournamentId)) {
    redirect('/admin/tournaments');
  }

  // 大会情報を取得
  const tournamentResult = await db.execute(`
    SELECT 
      tournament_id,
      tournament_name,
      format_name,
      venue_name,
      files_count
    FROM t_tournaments t
    LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    WHERE t.tournament_id = ?
  `, [tournamentId]);

  if (tournamentResult.rows.length === 0) {
    redirect('/admin/tournaments');
  }

  const tournament = tournamentResult.rows[0];

  // ファイル統計情報を取得
  const statsResult = await db.execute(`
    SELECT 
      COUNT(*) as total_files,
      COALESCE(SUM(file_size), 0) as total_size,
      COUNT(CASE WHEN is_public = 1 THEN 1 END) as public_files
    FROM t_tournament_files
    WHERE tournament_id = ?
  `, [tournamentId]);

  const stats = statsResult.rows[0];
  const totalFiles = Number(stats.total_files);
  const totalSize = Number(stats.total_size);
  const publicFiles = Number(stats.public_files);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* ヘッダー部分 */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/tournaments/${tournamentId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    大会管理に戻る
                  </Link>
                </Button>
                <div className="h-6 border-l border-border"></div>
                <FileText className="h-6 w-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-foreground">ファイル管理</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                {String(tournament.tournament_name)} - {String(tournament.format_name)} ({String(tournament.venue_name)})
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">大会ID: {tournamentId}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">総ファイル数</p>
                  <p className="text-2xl font-bold text-foreground">{totalFiles}</p>
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
                <Upload className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">公開ファイル数</p>
                  <p className="text-2xl font-bold text-foreground">{publicFiles} / {totalFiles}</p>
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