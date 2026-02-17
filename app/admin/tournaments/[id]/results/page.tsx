// app/admin/tournaments/[id]/results/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import type { TournamentStatus } from '@/lib/tournament-status';

async function getTournament(id: string): Promise<Tournament | null> {
  try {
    const result = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [parseInt(id)]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: Number(row.venue_id),
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      status: row.status as TournamentStatus,
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string
    };
  } catch (error) {
    console.error('大会データの取得に失敗:', error);
    return null;
  }
}

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TournamentResultsPage({ params }: ResultsPageProps) {
  const session = await auth();
  
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    redirect('/auth/login');
  }

  const resolvedParams = await params;
  const tournament = await getTournament(resolvedParams.id);

  if (!tournament) {
    redirect('/admin');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin" className="flex items-center">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ダッシュボードに戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground">結果入力</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  「{tournament.tournament_name}」の試合結果を入力・管理します
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card rounded-lg shadow p-8 text-center">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">
            結果入力画面
          </h2>
          <p className="text-muted-foreground mb-6">
            この画面では試合結果の入力・編集・確定を行います。<br />
            現在実装中です。
          </p>
          
          {/* 大会情報表示 */}
          <div className="bg-muted rounded-lg p-6 mt-8">
            <h3 className="text-lg font-semibold text-foreground mb-4">大会情報</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div>
                <span className="text-sm font-medium text-muted-foreground">大会名:</span>
                <p className="text-foreground">{tournament.tournament_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">フォーマット:</span>
                <p className="text-foreground">{tournament.format_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">会場:</span>
                <p className="text-foreground">{tournament.venue_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">参加チーム数:</span>
                <p className="text-foreground">{tournament.team_count}チーム</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Button variant="outline" asChild>
              <Link href="/admin">
                ダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}