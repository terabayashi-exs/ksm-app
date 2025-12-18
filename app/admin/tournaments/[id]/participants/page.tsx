// app/admin/tournaments/[id]/participants/page.tsx
// 参加チーム管理ページ

import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import ParticipantManagement from '@/components/features/admin/ParticipantManagement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Mail } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ParticipantsPage({ params }: PageProps) {
  const session = await auth();

  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id, 10);

  if (isNaN(tournamentId)) {
    redirect('/admin/tournaments');
  }

  // 大会情報取得
  const tournamentResult = await db.execute(`
    SELECT
      t.tournament_id,
      t.tournament_name,
      t.status,
      f.format_name,
      v.venue_name
    FROM t_tournaments t
    LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    WHERE t.tournament_id = ?
  `, [tournamentId]);

  if (tournamentResult.rows.length === 0) {
    redirect('/admin/tournaments');
  }

  const tournament = tournamentResult.rows[0];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              参加チーム管理
            </h1>
            <p className="text-muted-foreground mt-2">
              {String(tournament.tournament_name)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>{String(tournament.format_name)}</span>
              {tournament.venue_name && (
                <>
                  <span>•</span>
                  <span>{String(tournament.venue_name)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link
                href={`/admin/tournaments/${tournamentId}/participants/email`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                メール送信
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                ダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* 参加チーム管理コンポーネント */}
        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }>
          <ParticipantManagement tournamentId={tournamentId} />
        </Suspense>

        {/* 注意事項 */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-800 mb-2">💡 参加チーム管理について</h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>参加確定チームをキャンセル待ちに変更すると、参加枠が空きます</li>
              <li>キャンセル待ちチームを参加確定に変更すると、メールで通知されます</li>
              <li>辞退申請を承認すると、自動的にキャンセル済みになります</li>
              <li>辞退承認後は、試合結果に影響を与える可能性があります</li>
              <li>状態変更時はチーム代表者にメール通知が送信されます（設定で無効化可能）</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
