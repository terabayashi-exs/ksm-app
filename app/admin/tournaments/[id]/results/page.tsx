// app/admin/tournaments/[id]/results/page.tsx
export const metadata = { title: "試合結果管理" };

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Trophy, ChevronRight, Home } from 'lucide-react';
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
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
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
      venue_id: row.venue_id ? String(row.venue_id) : null,
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
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-_xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">結果入力</h1>
            <p className="text-sm text-white/70 mt-1">
              「{tournament.tournament_name}」の試合結果を入力・管理します
            </p>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
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
            結果入力
          </span>
        </nav>
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Trophy className="w-16 h-16 mx-auto text-gray-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            結果入力画面
          </h2>
          <p className="text-gray-500 mb-6">
            この画面では試合結果の入力・編集・確定を行います。<br />
            現在実装中です。
          </p>
          
          {/* 大会情報表示 */}
          <div className="bg-gray-50 rounded-lg p-6 mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">大会情報</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div>
                <span className="text-sm font-medium text-gray-500">大会名:</span>
                <p className="text-gray-900">{tournament.tournament_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">フォーマット:</span>
                <p className="text-gray-900">{tournament.format_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">会場:</span>
                <p className="text-gray-900">{tournament.venue_name}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">参加チーム数:</span>
                <p className="text-gray-900">{tournament.team_count}チーム</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Button variant="outline" asChild>
              <Link href="/my?tab=admin">
                マイダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}